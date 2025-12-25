/**
 * ██████╗  ██████╗ ██╗     ██╗ ██████╗███████╗     ██████╗██╗  ██╗██╗███████╗███████╗
 * ██╔══██╗██╔═══██╗██║     ██║██╔════╝██╔════╝    ██╔════╝██║  ██║██║██╔════╝██╔════╝
 * ██████╔╝██║   ██║██║     ██║██║     █████╗      ██║     ███████║██║█████╗  █████╗  
 * ██╔═══╝ ██║   ██║██║     ██║██║     ██╔══╝      ██║     ██╔══██║██║██╔══╝  ██╔══╝  
 * ██║     ╚██████╔╝███████╗██║╚██████╗███████╗    ╚██████╗██║  ██║██║███████╗██║     
 * ╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝╚══════╝     ╚═════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝     
 * 
 * ULTIMATE EDITION - ALL SYSTEMS INTEGRATED + ADVANCED BOUNTY LFG
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, Events } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

// Core Systems - Optional loading
let NexusLFG = null;
try { NexusLFG = require('./nexus/lfg'); } catch (e) {}
let VoiceSystem = null, VoiceChatHandler = null;
try { const v = require('./shared/voiceSystem'); VoiceSystem = v.VoiceSystem; VoiceChatHandler = v.VoiceChatHandler; } catch (e) {}
let UltimateBotIntelligence = null;
try { UltimateBotIntelligence = require('./shared/ultimateIntelligence').UltimateBotIntelligence; } catch (e) {}
let FreeRoamSystem = null;
try { FreeRoamSystem = require('./freeroam'); } catch (e) {}
let TheBrain = null;
try { TheBrain = require('./sentient').TheBrain; } catch (e) {}
let ApexBrain = null;
try { ApexBrain = require('./apex').ApexBrain; } catch (e) {}
let autonomousChat = null;
try { autonomousChat = require('./shared/autonomousChat'); } catch (e) {}
let mediaGenerator = null;
try { mediaGenerator = require('./shared/mediaGenerator'); } catch (e) {}

// ADVANCED BOUNTY LFG SYSTEM
const advancedBountyLFG = require('./shared/advancedBountyLFG');

const MY_BOT_ID = 'chief';
const BOT_NAME = 'Police Chief';
const PREFIX = '?';
const OTHER_BOT_IDS = [process.env.LESTER_BOT_ID, process.env.PAVEL_BOT_ID, process.env.CRIPPS_BOT_ID, process.env.MADAM_BOT_ID].filter(Boolean);
const ALLOWED_CHANNEL_IDS = process.env.ALLOWED_CHANNEL_IDS?.split(',').filter(Boolean) || [];

const CHIEF_SYSTEM = `You are the Sheriff/Police Chief from Red Dead Online. Bounty hunting coordinator.

CRITICAL: Keep responses SHORT - 2-4 sentences MAX. No essays!

PERSONALITY: Stern but fair lawman. All business, respects good hunters. Dry sense of humor.

STYLE: Direct and professional. Old West lawman tone. One *action* max.

SERVER CHANNELS (ONLY mention these - never make up channels):
- #bounty-lfg - Red Dead bounty LFG (use ?bounty)
- #wagon-lfg - Red Dead wagon LFG
- #cayo-lfg - GTA heist LFG
- #talk-to-chief - Chat with you
- #bot-commands - Command reference

NEVER mention channels that don't exist.

EXAMPLES:
"*tips hat* What brings you to my office?"
"Use ?bounty in #bounty-lfg. Legendary bounties pay best - Etta Doyle's the easiest."
"I've got my eye on you. Don't make me regret it."

You have memory. You keep files on everyone.`;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

// Make db available to handlers
client.db = pool;

let nexusLFG = null, intelligence = null, sentientBrain = null, apexBrain = null, freeRoam = null, voiceSystem = null, voiceChatHandler = null;
const conversationMemory = new Map();
const activeConversations = new Map();

client.once(Events.ClientReady, async () => {
  console.log(`[CHIEF ULTIMATE] Logged in as ${client.user.tag}`);

  // Initialize V6 Intelligence
  if (UltimateBotIntelligence) {
    try { 
      intelligence = new UltimateBotIntelligence(pool, client, MY_BOT_ID); 
      await intelligence.initialize(); 
      console.log('🧠 V6 Ultimate Intelligence: ONLINE'); 
    } catch (e) { console.error('V6 init:', e.message); }
  }
  
  // Other brain systems
  if (TheBrain) try { sentientBrain = new TheBrain(MY_BOT_ID, pool); console.log('🧬 Sentient Brain: ONLINE'); } catch (e) {}
  if (ApexBrain) try { apexBrain = new ApexBrain(MY_BOT_ID, pool); console.log('⚡ Apex Brain: ONLINE'); } catch (e) {}
  if (FreeRoamSystem) try { freeRoam = new FreeRoamSystem(MY_BOT_ID, client.user.id, CHIEF_SYSTEM, pool); console.log('🚀 FreeRoam: ONLINE'); } catch (e) {}
  if (NexusLFG) try { nexusLFG = new NexusLFG(pool, anthropic, client, MY_BOT_ID); await nexusLFG.initialize(); console.log('🎮 NEXUS LFG: ONLINE'); } catch (e) {}
  
  // Voice
  if (VoiceSystem && process.env.ELEVENLABS_API_KEY) { 
    try { 
      voiceSystem = new VoiceSystem(MY_BOT_ID, process.env.ELEVENLABS_API_KEY); 
      voiceChatHandler = new VoiceChatHandler(client, voiceSystem, CHIEF_SYSTEM, anthropic); 
      voiceChatHandler.setupListeners(); 
      console.log('🎙️ Voice: ONLINE'); 
    } catch (e) {} 
  }

  // Initialize ADVANCED BOUNTY LFG
  try {
    advancedBountyLFG.initialize(client);
    await advancedBountyLFG.createTables(client);
    console.log('🎯 Advanced Bounty LFG: ONLINE');
  } catch (e) {
    console.error('Bounty LFG init error:', e.message);
  }

  client.user.setPresence({ activities: [{ name: 'tracking bounties | ?bounty', type: 0 }], status: 'online' });
  
  // Autonomous chat
  if (autonomousChat && ALLOWED_CHANNEL_IDS.length > 0) {
    setTimeout(() => { 
      try { 
        autonomousChat.startAutonomous(
          ALLOWED_CHANNEL_IDS.map(id => client.channels.cache.get(id)).filter(Boolean), 
          { botId: MY_BOT_ID, botName: BOT_NAME, client, anthropic, pool, intelligence, personality: CHIEF_SYSTEM, otherBotIds: OTHER_BOT_IDS }
        ); 
      } catch (e) {} 
    }, 20000);
  }
  
  if (intelligence) await intelligence.broadcastToOtherBots('bot_online', { botId: MY_BOT_ID, timestamp: new Date().toISOString() });
  setInterval(() => { if (intelligence) intelligence.runMaintenance().catch(console.error); }, 6 * 60 * 60 * 1000);
  console.log('[CHIEF] ALL SYSTEMS ONLINE');
});

function isOtherBot(userId) { return OTHER_BOT_IDS.includes(userId); }
function isInActiveConversation(channelId, userId) { const c = activeConversations.get(channelId); if (!c) return false; if (Date.now() - c.lastTime > 60000) { activeConversations.delete(channelId); return false; } return c.userId === userId; }
function trackConversation(channelId, userId) { activeConversations.set(channelId, { userId, lastTime: Date.now() }); }

async function checkShouldRespond(message) {
  // NEVER respond in counting channel
  if (message.channel.name === 'counting') return false;
  
  // NEVER respond in OTHER bots' talk-to channels
  const channelName = message.channel.name;
  if (channelName.startsWith('talk-to-') && channelName !== 'talk-to-chief') return false;
  
  if (channelName === 'talk-to-chief') return true;
  if (isInActiveConversation(message.channel.id, message.author.id)) return true;
  if (message.mentions.has(client.user)) return true;
  const content = message.content.toLowerCase();
  if (content.includes('chief') || content.includes('sheriff') || content.includes('bounty') || content.includes('law') || content.includes('wanted')) return true;
  if (channelName.includes('lfg') || channelName.includes('log') || channelName.includes('staff')) return false;
  if (freeRoam) { const d = await freeRoam.shouldRespond(message); if (d.respond) return true; }
  if (isOtherBot(message.author.id)) return Math.random() < 0.35;
  return Math.random() < 0.20;
}

async function generateResponse(message) {
  const history = conversationMemory.get(message.author.id) || [];
  history.push({ role: 'user', content: message.content });
  while (history.length > 20) history.shift();

  try {
    await message.channel.sendTyping();
    let intelligencePrompt = '', ctx = null;
    if (intelligence) { ctx = await intelligence.processIncoming(message); intelligencePrompt = intelligence.buildPromptContext(ctx); }
    
    const response = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 200, system: CHIEF_SYSTEM + (intelligencePrompt ? '\n\n' + intelligencePrompt : ''), messages: history });
    let reply = response.content[0].text;
    
    if (intelligence && ctx) { reply = await intelligence.processOutgoing(message, reply, ctx); await intelligence.storeConversationMemory(message, reply); }
    history.push({ role: 'assistant', content: reply });
    conversationMemory.set(message.author.id, history);
    
    await new Promise(r => setTimeout(r, Math.min(reply.length * 25, 2500)));
    const sent = await message.reply(reply);
    trackConversation(message.channel.id, message.author.id);
    
    if (intelligence?.learning) await intelligence.learning.recordResponse(sent.id, message.channel.id, message.author.id, 'reply', 'general', reply.length);
    if (mediaGenerator) try { await mediaGenerator.handleBotMedia(MY_BOT_ID, reply, message.channel); } catch (e) {}
  } catch (e) { console.error('Response error:', e); await message.reply("*adjusts badge* Technical difficulties. Stand by."); }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot && !isOtherBot(message.author.id)) return;
  if (message.author.id === client.user.id) return;
  if (!message.guild) { await generateResponse(message); return; }

  const channelName = message.channel.name;

  // Don't respond in counting
  if (channelName === 'counting') return;

  // BOUNTY LFG Channel - Use ADVANCED system
  if (channelName === 'bounty-lfg') {
    const requiredRoles = ['Bounty Hunter', 'Frontier Outlaw', '🐴 Frontier Outlaw', '💀 Bounty Hunter'];
    const hasRole = message.member?.roles.cache.some(r => requiredRoles.some(req => r.name.includes(req) || r.name === req));
    const rolesChannel = message.guild.channels.cache.find(c => c.name === 'get-roles' || c.name === 'roles');
    
    if (!hasRole) {
      try { 
        await message.delete(); 
        const w = await message.channel.send(`<@${message.author.id}> Hold it right there. You need a **Bounty Hunter** or **Frontier Outlaw** role. ${rolesChannel ? `Head to <#${rolesChannel.id}>` : ''}`); 
        setTimeout(() => w.delete().catch(() => {}), 15000); 
      } catch (e) {}
      return;
    }
    
    // Handle commands
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const cmd = args.shift().toLowerCase();
      
      // ADVANCED BOUNTY LFG COMMANDS
      if (cmd === 'bounty' || cmd === 'legendary' || cmd === 'hunt') {
        await advancedBountyLFG.createSession(message, client);
        return;
      }
      
      // BLACKLIST COMMANDS
      if (cmd === 'myblacklist') {
        try {
          const { getBlacklistSystem } = require('./shared/blacklistSystem');
          const blacklist = getBlacklistSystem(pool);
          await blacklist.showBlacklist(message);
        } catch (e) { message.reply('*adjusts badge* Blacklist system is down, hunter.'); }
        return;
      }
      
      if (cmd === 'unblock') {
        try {
          const { getBlacklistSystem } = require('./shared/blacklistSystem');
          const blacklist = getBlacklistSystem(pool);
          const target = message.mentions.users.first();
          if (!target) return message.reply('Mention someone: `?unblock @user`');
          await blacklist.removeFromBlacklist(message.author.id, target.id);
          message.reply(`✅ **${target.username}** can join your bounties again, hunter.`);
        } catch (e) { message.reply('Could not process that unblock, hunter.'); }
        return;
      }
      
      if (cmd === 'endbounty') {
        await message.reply('*adjusts badge* Use the End Session button on your active bounty, hunter.');
        return;
      }
      
      // Legacy nexus commands fallback
      if (['posse', 'done', 'cancel'].includes(cmd) && nexusLFG) {
        await nexusLFG.handleCommand(message, cmd, args);
        return;
      }
    }
    
    // Natural language LFG detection (legacy)
    if (nexusLFG) { 
      const lfg = await nexusLFG.detectLFGIntent(message); 
      if (lfg) { 
        await advancedBountyLFG.createSession(message, client);
        return; 
      } 
    }
    
    // Non-command message in LFG channel - delete and warn
    try { 
      await message.delete(); 
      const w = await message.channel.send(`<@${message.author.id}> This is official business. Use \`?bounty\` to start a hunt.`); 
      setTimeout(() => w.delete().catch(() => {}), 10000);
    } catch (e) {}
    return;
  }

  // Commands in other channels
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    if (cmd === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('⭐ Police Chief - Bounty Coordinator')
        .setDescription("*tips hat* Here's how this works...")
        .addFields(
          { name: '🎯 Bounty LFG (Use in #bounty-lfg)', value: 
            '`?bounty` - Start a bounty hunting session\n' +
            '• Select bounty type (Regular/Legendary/Infamous)\n' +
            '• Choose legendary targets with difficulty ratings\n' +
            '• Timer vs Speed payout strategy\n' +
            '• Auto voice channel creation\n' +
            '• Cash & Gold tracking'
          },
          { name: '🎙️ Voice', value: '`?voice join` / `?voice leave`' },
          { name: '📊 Info', value: '`?ping` - Check system status' }
        )
        .setColor(0xFFD700)
        .setFooter({ text: 'ULTIMATE Edition + Advanced LFG' });
      await message.reply({ embeds: [embed] });
      return;
    }
    
    if (cmd === 'ping') { 
      await message.reply(`*adjusts badge* System operational. ${client.ws.ping}ms.`); 
      return; 
    }
    
    if (cmd === 'voice') {
      if (!voiceSystem) return message.reply("Voice system offline.");
      if (args[0] === 'join') { 
        const vc = message.member.voice.channel; 
        if (!vc) return message.reply("Get in a voice channel first."); 
        const ok = await voiceChatHandler?.joinAndGreet(vc); 
        message.reply(ok ? `🎙️ Joining ${vc.name}` : "Can't join."); 
      }
      else if (args[0] === 'leave') { 
        voiceSystem.leaveChannel(); 
        message.reply("*disconnects radio*"); 
      }
      return;
    }
    
    // BOUNTY COMMAND IN WRONG CHANNEL - Redirect to #bounty-lfg
    if (cmd === 'bounty' || cmd === 'hunt' || cmd === 'legendary') {
      const lfgChannel = message.guild.channels.cache.find(c => c.name === 'bounty-lfg');
      await message.reply(`*points to board* Wrong place, hunter! Head to ${lfgChannel ? `<#${lfgChannel.id}>` : '#bounty-lfg'} for official bounty business.`);
      return;
    }
  }

  if (await checkShouldRespond(message)) await generateResponse(message);
});

// Handle button/select interactions for Advanced LFG
client.on(Events.InteractionCreate, async (i) => { 
  // Legacy nexus buttons
  if (i.isButton() && i.customId.startsWith('lfg_') && nexusLFG) {
    await nexusLFG.handleButton(i); 
  }
  // Note: Advanced Bounty LFG handles its own interactions via the initialize() listener
});

client.on(Events.MessageReactionAdd, async (r, u) => { 
  if (u.bot) return; 
  if (r.partial) try { await r.fetch(); } catch (e) { return; } 
  if (nexusLFG) await nexusLFG.handleReaction(r, u); 
  if (intelligence && r.message.author?.id === client.user.id) await intelligence.handleReaction(r.message.id, r.emoji.name, u.id); 
});

client.on(Events.VoiceStateUpdate, (o, n) => { 
  if (intelligence?.contextAwareness && n.guild) intelligence.contextAwareness.updateVoiceState(n.guild.id, n); 
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);
client.login(process.env.DISCORD_TOKEN);
