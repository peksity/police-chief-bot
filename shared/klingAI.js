/**
 * KLING AI INTEGRATION
 * Video and Image generation using Kling AI API
 * 
 * Features:
 * - Generate images from text prompts
 * - Generate short videos
 * - Gaming-themed content generation
 * - Wanted posters, victory screens, etc.
 */

const https = require('https');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

class KlingAI {
  constructor(accessKey, secretKey) {
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.baseUrl = 'api.klingai.com';
    this.cooldowns = new Map();
    this.COOLDOWN_MS = 30000; // 30 second cooldown
  }

  /**
   * Generate JWT token for API authentication
   */
  generateToken() {
    const jwt = require('jsonwebtoken');
    const now = Math.floor(Date.now() / 1000);
    
    const payload = {
      iss: this.accessKey,
      exp: now + 1800, // 30 minutes
      nbf: now - 5
    };

    return jwt.sign(payload, this.secretKey, { 
      algorithm: 'HS256',
      header: { alg: 'HS256', typ: 'JWT' }
    });
  }

  /**
   * Make API request
   */
  async apiRequest(endpoint, method = 'POST', data = null) {
    return new Promise((resolve, reject) => {
      const token = this.generateToken();
      
      const options = {
        hostname: this.baseUrl,
        path: endpoint,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ error: body });
          }
        });
      });

      req.on('error', reject);
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  /**
   * Check cooldown
   */
  isOnCooldown(userId) {
    const lastUse = this.cooldowns.get(userId);
    if (!lastUse) return false;
    return (Date.now() - lastUse) < this.COOLDOWN_MS;
  }

  /**
   * Set cooldown
   */
  setCooldown(userId) {
    this.cooldowns.set(userId, Date.now());
  }

  /**
   * Generate an image
   */
  async generateImage(prompt, options = {}) {
    try {
      const requestData = {
        model_name: options.model || 'kling-v1',  // Use base model
        prompt: prompt,
        negative_prompt: options.negativePrompt || 'blurry, low quality, distorted',
        cfg_scale: options.cfgScale || 7,
        aspect_ratio: options.aspectRatio || '16:9',
        n: options.count || 1
      };

      console.log('[KLING] Sending image request:', JSON.stringify(requestData));
      const response = await this.apiRequest('/v1/images/generations', 'POST', requestData);
      console.log('[KLING] Response:', JSON.stringify(response));
      
      if (response.code !== 0 && response.code !== undefined) {
        return { success: false, error: response.message || 'API error' };
      }

      if (response.error) {
        return { success: false, error: response.error };
      }

      return {
        success: true,
        taskId: response.data?.task_id,
        status: response.data?.task_status
      };

    } catch (error) {
      console.error('[KLING] Image generation error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate a video
   */
  async generateVideo(prompt, options = {}) {
    try {
      const requestData = {
        model_name: options.model || 'kling-v1',  // Use base model
        prompt: prompt,
        negative_prompt: options.negativePrompt || 'blurry, low quality',
        duration: options.duration || '5', // 5 or 10 seconds
        aspect_ratio: options.aspectRatio || '16:9',
        cfg_scale: options.cfgScale || 0.5
        // Removed 'mode' parameter - not supported on all models
      };

      console.log('[KLING] Sending video request:', JSON.stringify(requestData));
      const response = await this.apiRequest('/v1/videos/text2video', 'POST', requestData);
      console.log('[KLING] Response:', JSON.stringify(response));
      
      if (response.code !== 0 && response.code !== undefined) {
        return { success: false, error: response.message || 'API error' };
      }

      if (response.error) {
        return { success: false, error: response.error };
      }

      return {
        success: true,
        taskId: response.data?.task_id,
        status: response.data?.task_status
      };

    } catch (error) {
      console.error('[KLING] Video generation error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check task status
   */
  async checkTaskStatus(taskId, type = 'image') {
    try {
      const endpoint = type === 'video' 
        ? `/v1/videos/text2video/${taskId}`
        : `/v1/images/generations/${taskId}`;
      
      const response = await this.apiRequest(endpoint, 'GET');
      
      return {
        success: true,
        status: response.data?.task_status,
        result: response.data?.task_result,
        data: response.data
      };

    } catch (error) {
      console.error('[KLING] Status check error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for task completion
   */
  async waitForTask(taskId, type = 'image', maxWait = 120000) {
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < maxWait) {
      const status = await this.checkTaskStatus(taskId, type);
      
      if (status.status === 'succeed' || status.status === 'completed') {
        return status;
      }
      
      if (status.status === 'failed') {
        return { success: false, error: 'Generation failed' };
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }

    return { success: false, error: 'Timeout waiting for generation' };
  }
}

/**
 * Pre-built prompts for gaming content
 */
const GamingPrompts = {
  // GTA Style
  wantedPoster: (name) => 
    `GTA 5 style wanted poster, "WANTED" text at top, criminal mugshot style, dark gritty background, reward money at bottom, realistic game art style, name "${name}" on poster`,
  
  heistSuccess: (amount) =>
    `GTA Online heist success screen, green money raining, "${amount}" in large gold text, celebration, cinematic lighting, game UI style`,
  
  cayoPerico: () =>
    `Cayo Perico island from GTA Online, tropical paradise with compound, helicopter view, sunset lighting, cinematic game screenshot`,
  
  getawayDriver: () =>
    `GTA 5 style getaway scene, sports car speeding through city at night, police lights in background, cinematic chase, neon lights`,

  // Red Dead Style
  bountyPoster: (name) =>
    `Red Dead Redemption 2 style bounty poster, old west wanted poster, weathered paper texture, "DEAD OR ALIVE" text, reward money, name "${name}"`,
  
  cowboyShowdown: () =>
    `Red Dead Redemption 2 western showdown, two cowboys at high noon, dusty main street, dramatic lighting, cinematic`,
  
  campfire: () =>
    `Red Dead Online camp at night, campfire, horse nearby, stars in sky, cozy western atmosphere, cinematic lighting`,
  
  wagonDelivery: () =>
    `Red Dead Online trader wagon delivery, horse-drawn wagon full of goods, scenic western trail, golden hour lighting`,

  // Generic Gaming
  victory: (text) =>
    `Video game victory screen, "${text}" in bold golden text, celebration confetti, epic lighting, dramatic pose`,
  
  levelUp: (level) =>
    `RPG level up screen, "LEVEL ${level}" in glowing text, magical particles, epic fantasy lighting, game UI style`,
  
  loot: () =>
    `Video game loot drop, golden chest opening, rare items glowing, magical effects, game art style`,

  // Custom
  custom: (prompt) => prompt
};

/**
 * Discord command handlers for Kling AI
 */
class KlingCommands {
  constructor(klingAI) {
    this.kling = klingAI;
  }

  /**
   * Handle ?generate command
   */
  async handleGenerate(message, args) {
    if (this.kling.isOnCooldown(message.author.id)) {
      return message.reply('⏳ Please wait 30 seconds between generations.');
    }

    const prompt = args.join(' ');
    if (!prompt) {
      return message.reply('Usage: `?generate [your prompt]`\nExample: `?generate epic GTA heist scene`');
    }

    const waitMsg = await message.reply('🎨 Generating image... This may take a minute.');
    this.kling.setCooldown(message.author.id);

    try {
      const result = await this.kling.generateImage(prompt);
      
      if (!result.success) {
        return waitMsg.edit(`❌ Generation failed: ${result.error}`);
      }

      // Wait for completion
      const final = await this.kling.waitForTask(result.taskId, 'image');
      
      if (!final.success) {
        return waitMsg.edit(`❌ ${final.error}`);
      }

      const imageUrl = final.result?.images?.[0]?.url;
      if (!imageUrl) {
        return waitMsg.edit('❌ No image was generated.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🎨 AI Generated Image')
        .setDescription(`**Prompt:** ${prompt.slice(0, 200)}`)
        .setImage(imageUrl)
        .setFooter({ text: `Generated by ${message.author.username}` })
        .setColor(0x00FF00)
        .setTimestamp();

      await waitMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      console.error('[KLING] Generate error:', error);
      await waitMsg.edit(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Handle ?wanted command - Generate wanted poster
   */
  async handleWanted(message, args) {
    if (this.kling.isOnCooldown(message.author.id)) {
      return message.reply('⏳ Please wait 30 seconds between generations.');
    }

    const target = message.mentions.users.first() || message.author;
    const name = args.filter(a => !a.startsWith('<@')).join(' ') || target.username;

    const waitMsg = await message.reply(`🤠 Creating wanted poster for **${name}**...`);
    this.kling.setCooldown(message.author.id);

    try {
      const prompt = GamingPrompts.wantedPoster(name);
      const result = await this.kling.generateImage(prompt);
      
      if (!result.success) {
        return waitMsg.edit(`❌ Failed: ${result.error}`);
      }

      const final = await this.kling.waitForTask(result.taskId, 'image');
      
      if (!final.success || !final.result?.images?.[0]?.url) {
        return waitMsg.edit('❌ Failed to generate wanted poster.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🤠 WANTED')
        .setDescription(`**${name}**\nDead or Alive`)
        .setImage(final.result.images[0].url)
        .setColor(0x8B4513)
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp();

      await waitMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      await waitMsg.edit(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Handle ?bounty command - RDR2 style bounty poster
   */
  async handleBounty(message, args) {
    if (this.kling.isOnCooldown(message.author.id)) {
      return message.reply('⏳ Please wait 30 seconds between generations.');
    }

    const target = message.mentions.users.first() || message.author;
    const name = args.filter(a => !a.startsWith('<@')).join(' ') || target.username;

    const waitMsg = await message.reply(`📜 Creating bounty poster for **${name}**...`);
    this.kling.setCooldown(message.author.id);

    try {
      const prompt = GamingPrompts.bountyPoster(name);
      const result = await this.kling.generateImage(prompt);
      
      if (!result.success) {
        return waitMsg.edit(`❌ Failed: ${result.error}`);
      }

      const final = await this.kling.waitForTask(result.taskId, 'image');
      
      if (!final.success || !final.result?.images?.[0]?.url) {
        return waitMsg.edit('❌ Failed to generate bounty poster.');
      }

      const reward = Math.floor(Math.random() * 900 + 100); // $100-$999

      const embed = new EmbedBuilder()
        .setTitle('📜 BOUNTY')
        .setDescription(`**${name}**\nDead or Alive\n💰 Reward: $${reward}.00`)
        .setImage(final.result.images[0].url)
        .setColor(0xD2691E)
        .setFooter({ text: `Posted by Sheriff ${message.author.username}` })
        .setTimestamp();

      await waitMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      await waitMsg.edit(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Handle ?victory command
   */
  async handleVictory(message, args) {
    if (this.kling.isOnCooldown(message.author.id)) {
      return message.reply('⏳ Please wait 30 seconds between generations.');
    }

    const text = args.join(' ') || 'HEIST COMPLETE';
    const waitMsg = await message.reply('🎉 Generating victory screen...');
    this.kling.setCooldown(message.author.id);

    try {
      const prompt = GamingPrompts.victory(text);
      const result = await this.kling.generateImage(prompt);
      
      if (!result.success) {
        return waitMsg.edit(`❌ Failed: ${result.error}`);
      }

      const final = await this.kling.waitForTask(result.taskId, 'image');
      
      if (!final.success || !final.result?.images?.[0]?.url) {
        return waitMsg.edit('❌ Failed to generate victory screen.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🎉 VICTORY!')
        .setDescription(`**${text}**`)
        .setImage(final.result.images[0].url)
        .setColor(0xFFD700)
        .setFooter({ text: message.author.username })
        .setTimestamp();

      await waitMsg.edit({ content: null, embeds: [embed] });

    } catch (error) {
      await waitMsg.edit(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Handle ?video command
   */
  async handleVideo(message, args) {
    if (this.kling.isOnCooldown(message.author.id)) {
      return message.reply('⏳ Please wait 30 seconds between generations.');
    }

    const prompt = args.join(' ');
    if (!prompt) {
      return message.reply('Usage: `?video [your prompt]`\nExample: `?video epic car chase through city`');
    }

    const waitMsg = await message.reply('🎬 Generating video... This may take 1-2 minutes.');
    this.kling.setCooldown(message.author.id);

    try {
      const result = await this.kling.generateVideo(prompt);
      
      if (!result.success) {
        return waitMsg.edit(`❌ Generation failed: ${result.error}`);
      }

      // Wait for completion (videos take longer)
      const final = await this.kling.waitForTask(result.taskId, 'video', 180000);
      
      if (!final.success) {
        return waitMsg.edit(`❌ ${final.error}`);
      }

      const videoUrl = final.result?.videos?.[0]?.url;
      if (!videoUrl) {
        return waitMsg.edit('❌ No video was generated.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🎬 AI Generated Video')
        .setDescription(`**Prompt:** ${prompt.slice(0, 200)}\n\n[Click to watch](${videoUrl})`)
        .setFooter({ text: `Generated by ${message.author.username}` })
        .setColor(0x9932CC)
        .setTimestamp();

      await waitMsg.edit({ content: videoUrl, embeds: [embed] });

    } catch (error) {
      console.error('[KLING] Video error:', error);
      await waitMsg.edit(`❌ Error: ${error.message}`);
    }
  }
}

module.exports = { KlingAI, KlingCommands, GamingPrompts };
