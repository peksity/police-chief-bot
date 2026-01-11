/**
 * IMAGE RECOGNITION SYSTEM
 * Uses Claude Vision to analyze screenshots
 * 
 * Features:
 * - Analyze GTA/RDO earnings screenshots
 * - Identify locations on maps
 * - Read text from images
 * - Detect game situations
 * - Give advice based on what it sees
 */

const Anthropic = require('@anthropic-ai/sdk');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const https = require('https');
const http = require('http');

class ImageRecognition {
  constructor(anthropicClient) {
    this.anthropic = anthropicClient;
    this.analysisCache = new Map(); // Cache recent analyses
    this.cooldowns = new Map(); // Prevent spam
    this.COOLDOWN_MS = 10000; // 10 second cooldown per user
  }

  /**
   * Check if user is on cooldown
   */
  isOnCooldown(userId) {
    const lastUse = this.cooldowns.get(userId);
    if (!lastUse) return false;
    return (Date.now() - lastUse) < this.COOLDOWN_MS;
  }

  /**
   * Set user cooldown
   */
  setCooldown(userId) {
    this.cooldowns.set(userId, Date.now());
  }

  /**
   * Download image and convert to base64
   */
  async imageToBase64(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      protocol.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          return this.imageToBase64(response.headers.location).then(resolve).catch(reject);
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString('base64');
          const contentType = response.headers['content-type'] || 'image/png';
          resolve({ base64, contentType });
        });
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Analyze an image with Claude Vision
   */
  async analyzeImage(imageUrl, context = '', botPersonality = '') {
    try {
      const { base64, contentType } = await this.imageToBase64(imageUrl);
      
      // Determine media type
      let mediaType = 'image/png';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        mediaType = 'image/jpeg';
      } else if (contentType.includes('gif')) {
        mediaType = 'image/gif';
      } else if (contentType.includes('webp')) {
        mediaType = 'image/webp';
      }

      const systemPrompt = `You are analyzing a screenshot from a gaming Discord server focused on GTA Online and Red Dead Online.

${botPersonality}

ANALYSIS GUIDELINES:
- If it's an earnings/money screenshot: Note the amount, congratulate or give tips
- If it's a map/location: Identify where it is, give relevant tips
- If it's gameplay: Describe what's happening, offer advice
- If it's a glitch/bug: Identify it if you can
- If it's unrelated to gaming: Still describe it but note it's off-topic

Keep response SHORT - 2-4 sentences max unless detailed analysis is needed.
Be helpful and match the personality provided.

${context ? `Additional context from user: ${context}` : ''}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64
                }
              },
              {
                type: 'text',
                text: context || 'What do you see in this image? Analyze it.'
              }
            ]
          }
        ]
      });

      return {
        success: true,
        analysis: response.content[0].text,
        tokens: response.usage?.input_tokens || 0
      };

    } catch (error) {
      console.error('[IMAGE] Analysis error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze earnings screenshot specifically
   */
  async analyzeEarnings(imageUrl) {
    try {
      const { base64, contentType } = await this.imageToBase64(imageUrl);
      
      let mediaType = 'image/png';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) mediaType = 'image/jpeg';

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: `You are analyzing a GTA Online or Red Dead Online earnings/money screenshot.

Extract and respond with:
1. The amount of money shown (if visible)
2. What activity it's from (heist, sale, mission, etc.)
3. A brief reaction/tip

Format: Keep it short and casual. If you can't read the numbers clearly, say so.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 }
              },
              { type: 'text', text: 'What are the earnings shown here?' }
            ]
          }
        ]
      });

      return {
        success: true,
        analysis: response.content[0].text
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze map/location screenshot
   */
  async analyzeLocation(imageUrl) {
    try {
      const { base64, contentType } = await this.imageToBase64(imageUrl);
      
      let mediaType = 'image/png';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) mediaType = 'image/jpeg';

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: `You are analyzing a GTA Online or Red Dead Online map screenshot.

Identify:
1. The location shown (city, area, landmark)
2. Any markers, blips, or objectives visible
3. Relevant tips for that area

If it's GTA: Reference Los Santos, Blaine County, Cayo Perico, etc.
If it's RDO: Reference New Austin, West Elizabeth, Lemoyne, etc.

Keep response helpful and brief.`,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 }
              },
              { type: 'text', text: 'Where is this location and what should I know about it?' }
            ]
          }
        ]
      });

      return {
        success: true,
        analysis: response.content[0].text
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle image in Discord message
   */
  async handleDiscordImage(message, botPersonality = '', customPrompt = '') {
    // Check for attachments
    const attachment = message.attachments.first();
    if (!attachment) return null;

    // Check if it's an image
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const isImage = imageExtensions.some(ext => 
      attachment.name.toLowerCase().endsWith(ext) ||
      attachment.contentType?.startsWith('image/')
    );

    if (!isImage) return null;

    // Check cooldown
    if (this.isOnCooldown(message.author.id)) {
      return {
        success: false,
        error: 'Please wait a few seconds before analyzing another image.'
      };
    }

    // Set cooldown
    this.setCooldown(message.author.id);

    // Analyze the image
    const result = await this.analyzeImage(
      attachment.url,
      customPrompt || message.content,
      botPersonality
    );

    return result;
  }

  /**
   * Create embed for image analysis
   */
  createAnalysisEmbed(analysis, username, imageUrl) {
    return new EmbedBuilder()
      .setTitle('🔍 Image Analysis')
      .setDescription(analysis)
      .setThumbnail(imageUrl)
      .setFooter({ text: `Requested by ${username}` })
      .setColor(0x00FF00)
      .setTimestamp();
  }
}

// Bot-specific analysis handlers
const BotImageHandlers = {
  lester: {
    personality: `You are Lester Crest analyzing this image. You're a paranoid genius hacker.
    
Response style:
- Technical observations
- Paranoid comments about security/cops
- References to "the score" or heists
- Condescending but helpful

Example: "*adjusts glasses* Hmm, I see you pulled $2.3 million from Cayo. Not bad, but I've seen better. The drainage tunnel approach? Classic. Just make sure the feds aren't tracking your deposits..."`,
    
    async analyze(imageRecognition, imageUrl, context) {
      return await imageRecognition.analyzeImage(imageUrl, context, this.personality);
    }
  },

  pavel: {
    personality: `You are Pavel analyzing this image. You're an optimistic Russian submarine captain.
    
Response style:
- Russian accent ("Kapitan", "is good, yes?")
- Submarine/naval references
- Optimistic and supportive
- References to Mr. Rubio as the enemy

Example: "Ah, Kapitan! Look at this beautiful score! $2.3 million from El Rubio's island, yes? The Kosatka, she is proud! Maybe we celebrate with some vodka?"`,
    
    async analyze(imageRecognition, imageUrl, context) {
      return await imageRecognition.analyzeImage(imageUrl, context, this.personality);
    }
  },

  cripps: {
    personality: `You are Cripps analyzing this image. You're a grumpy old camp manager.
    
Response style:
- Old West speech patterns
- Complaining but helpful
- References to trading/hunting
- Mentions of his mysterious past

Example: "*squints at the image* Well I'll be... that's a good haul of pelts there. Back in my bank robbing days, we never had fancy pictures like this. Now quit standing around and help me move this camp!"`,
    
    async analyze(imageRecognition, imageUrl, context) {
      return await imageRecognition.analyzeImage(imageUrl, context, this.personality);
    }
  },

  chief: {
    personality: `You are the Police Chief/Sheriff analyzing this image. You're a stern lawman.
    
Response style:
- Professional and stern
- Law enforcement perspective
- Dry humor
- References to bounties and criminals

Example: "*studies the image carefully* I see you've been busy. That bounty target in the photo - Etta Doyle. She's a slippery one. Good work bringing her in. The state thanks you."`,
    
    async analyze(imageRecognition, imageUrl, context) {
      return await imageRecognition.analyzeImage(imageUrl, context, this.personality);
    }
  },

  nazar: {
    personality: `You are Madam Nazar analyzing this image. You're a mystical fortune teller.
    
Response style:
- Mystical and cryptic
- References to spirits, fate, destiny
- Dramatic pauses (...)
- Actually helpful underneath the mystique

Example: "*gazes into the image* Ah... the spirits show me what you've found. A collectible... rare and valuable. The cards told me you would find this today. Bring it to me, and fortune shall favor you..."`,
    
    async analyze(imageRecognition, imageUrl, context) {
      return await imageRecognition.analyzeImage(imageUrl, context, this.personality);
    }
  }
};

module.exports = { ImageRecognition, BotImageHandlers };
