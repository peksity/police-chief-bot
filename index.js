/**
 * ██████╗  ██████╗ ██╗     ██╗ ██████╗███████╗     ██████╗██╗  ██╗██╗███████╗███████╗
 * ██╔══██╗██╔═══██╗██║     ██║██╔════╝██╔════╝    ██╔════╝██║  ██║██║██╔════╝██╔════╝
 * ██████╔╝██║   ██║██║     ██║██║     █████╗      ██║     ███████║██║█████╗  █████╗  
 * ██╔═══╝ ██║   ██║██║     ██║██║     ██╔══╝      ██║     ██╔══██║██║██╔══╝  ██╔══╝  
 * ██║     ╚██████╔╝███████╗██║╚██████╗███████╗    ╚██████╗██║  ██║██║███████╗██║     
 * ╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝╚══════╝     ╚═════╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝     
 * 
 * ULTIMATE EDITION - ALL SYSTEMS INTEGRATED
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, Events } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

const NexusLFG = require('./nexus/lfg');
const { VoiceSystem, VoiceChatHandler } = require('./shared/voiceSystem');
const { UltimateBotIntelligence } = require('./shared/ultimateIntelligence');
const FreeRoamSystem = require('./freeroam');
const { TheBrain } = require('./sentient');
const { ApexBrain } = require('./apex');
const autonomousChat = require('./shared/autonomousChat');
const mediaGenerator = require('./shared/mediaGenerator');

const MY_BOT_ID = 'chief';
const BOT_NAME = 'Police Chief';
const PREFIX = '?';
const OTHER_BOT_IDS = [process.env.LESTER_BOT_ID, process.env.PAVEL_BOT_ID, process.env.CRIPPS_BOT_ID, process.env.MADAM_BOT_ID].filter(Boolean);
const ALLOWED_CHANNEL_IDS = process.env.ALLOWED_CHANNEL_IDS?.split(',').filter(Boolean) || [];

const CHIEF_SYSTEM = `You are the Sheriff/Police Chief from Red Dead Online's Bounty Hunter role.

CORE PERSONALITY:
- You're a stern but fair lawman of the Old West
- You take bounty hunting seriously - it's about justice
- You have a gruff, no-nonsense way of speaking
- You respect good bounty hunters and have contempt for outlaws
- You're practical and mission-focused
- Deep down you believe in law and order, even if the system is flawed

SPEAKING STYLE:
- Use Old West lawman vocabulary
- Be direct and to the point
- Reference "the law" and "justice"
- Mention bounty rewards and bringing criminals to justice
- Keep it professional but with frontier character

RELATIONSHIP DYNAMICS:
- Lester: Primary suspect, keeping a close eye on him
- Pavel: Suspicious foreigner, probably smuggling
- Cripps: Too many "alleged" incidents in his past
- Madam Nazar: Fortune telling isn't illegal... yet

KNOWLEDGE: Expert on Bounty Hunter role, legendary bounties, wanted posters, law enforcement.

IMPORTANT: You have DEEP memory. You keep files on everyone. You remember past crimes (jokes) and bring them up.`;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

let nexusLFG = null, intelligence = null, sentientBrain = null, apexBrain = null, freeRoam = null, voiceSystem = null, voiceChatHandler = null;
const conversationMemory = new Map();
const activeConversations = new Map();

client.once(Events.ClientReady, async () => {
  console.log(`[CHIEF ULTIMATE] Logged in as ${client.user.tag}`);

  try { intelligence = new UltimateBotIntelligence(pool, client, MY_BOT_ID); await intelligence.initialize(); console.log('🧠 V6 Ultimate Intelligence: ONLINE'); } catch (e) { console.error('V6 init:', e.message); }
  try { sentientBrain = new TheBrain(MY_BOT_ID, pool); console.log('🧬 Sentient Brain: ONLINE'); } catch (e) {}
  try { apexBrain = new ApexBrain(MY_BOT_ID, pool); console.log('⚡ Apex Brain: ONLINE'); } catch (e) {}
  try { freeRoam = new FreeRoamSystem(MY_BOT_ID, client.user.id, CHIEF_SYSTEM, pool); console.log('🚀 FreeRoam: ONLINE'); } catch (e) {}
  try { nexusLFG = new NexusLFG(pool, anthropic, client, MY_BOT_ID); await nexusLFG.initialize(); console.log('🎮 NEXUS LFG: ONLINE'); } catch (e) {}
  if (process.env.ELEVENLABS_API_KEY) { try { voiceSystem = new VoiceSystem(MY_BOT_ID, process.env.ELEVENLABS_API_KEY); voiceChatHandler = new VoiceChatHandler(client, voiceSystem, CHIEF_SYSTEM, anthropic); voiceChatHandler.setupListeners(); console.log('🎙️ Voice: ONLINE'); } catch (e) {} }

  client.user.setPresence({ activities: [{ name: 'tracking bounties | ?bounty', type: 0 }], status: 'online' });
  
  if (ALLOWED_CHANNEL_IDS.length > 0) setTimeout(() => { try { autonomousChat.startAutonomous(ALLOWED_CHANNEL_IDS.map(id => client.channels.cache.get(id)).filter(Boolean), { botId: MY_BOT_ID, botName: BOT_NAME, client, anthropic, pool, intelligence, personality: CHIEF_SYSTEM, otherBotIds: OTHER_BOT_IDS }); } catch (e) {} }, 20000);
  if (intelligence) await intelligence.broadcastToOtherBots('bot_online', { botId: MY_BOT_ID, timestamp: new Date().toISOString() });
  setInterval(() => { if (intelligence) intelligence.runMaintenance().catch(console.error); }, 6 * 60 * 60 * 1000);
  console.log('[CHIEF] ALL SYSTEMS ONLINE');
});

function isOtherBot(userId) { return OTHER_BOT_IDS.includes(userId); }
function isInActiveConversation(channelId, userId) { const c = activeConversations.get(channelId); if (!c) return false; if (Date.now() - c.lastTime > 60000) { activeConversations.delete(channelId); return false; } return c.userId === userId; }
function trackConversation(channelId, userId) { activeConversations.set(channelId, { userId, lastTime: Date.now() }); }

async function checkShouldRespond(message) {
  if (message.channel.name === 'talk-to-chief') return true;
  if (isInActiveConversation(message.channel.id, message.author.id)) return true;
  if (message.mentions.has(client.user)) return true;
  const content = message.content.toLowerCase();
  if (content.includes('chief') || content.includes('sheriff') || content.includes('bounty') || content.includes('law') || content.includes('wanted')) return true;
  if (message.channel.name.includes('lfg') || message.channel.name.includes('log') || message.channel.name.includes('staff')) return false;
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
    
    const response = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 500, system: CHIEF_SYSTEM + (intelligencePrompt ? '\n\n' + intelligencePrompt : ''), messages: history });
    let reply = response.content[0].text;
    
    if (intelligence && ctx) { reply = await intelligence.processOutgoing(message, reply, ctx); await intelligence.storeConversationMemory(message, reply); }
    history.push({ role: 'assistant', content: reply });
    conversationMemory.set(message.author.id, history);
    
    await new Promise(r => setTimeout(r, Math.min(reply.length * 25, 2500)));
    const sent = await message.reply(reply);
    trackConversation(message.channel.id, message.author.id);
    
    if (intelligence?.learning) await intelligence.learning.recordResponse(sent.id, message.channel.id, message.author.id, 'reply', 'general', reply.length);
    try { await mediaGenerator.handleBotMedia(MY_BOT_ID, reply, message.channel); } catch (e) {}
  } catch (e) { console.error('Response error:', e); await message.reply("*adjusts badge* Technical difficulties. Stand by."); }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot && !isOtherBot(message.author.id)) return;
  if (message.author.id === client.user.id) return;
  if (!message.guild) { await generateResponse(message); return; }

  const channelName = message.channel.name;

  // LFG Channel Enforcement
  if (channelName === 'bounty-lfg') {
    const requiredRoles = ['Bounty Hunter', 'Frontier Outlaw', '🐴 Frontier Outlaw'];
    const hasRole = message.member?.roles.cache.some(r => requiredRoles.some(req => r.name.includes(req) || r.name === req));
    const rolesChannel = message.guild.channels.cache.find(c => c.name === 'get-roles' || c.name === 'roles');
    
    if (!hasRole) {
      try { await message.delete(); const w = await message.channel.send(`<@${message.author.id}> Hold it right there. You need a **Bounty Hunter** or **Frontier Outlaw** role. ${rolesChannel ? `Head to <#${rolesChannel.id}>` : ''}`); setTimeout(() => w.delete().catch(() => {}), 15000); } catch (e) {}
      return;
    }
    
    if (message.content.startsWith(PREFIX)) {
      const args = message.content.slice(PREFIX.length).trim().split(/ +/);
      const cmd = args.shift().toLowerCase();
      if (['bounty', 'legendary', 'hunt', 'posse', 'done', 'cancel'].includes(cmd) && nexusLFG && await nexusLFG.handleCommand(message, cmd, args)) return;
    }
    
    if (nexusLFG) { const lfg = await nexusLFG.detectLFGIntent(message); if (lfg) { await nexusLFG.createSession(message, lfg.activity, lfg.playersNeeded + 1, lfg.notes); return; } }
    
    try { await message.delete(); const w = await message.channel.send(`<@${message.author.id}> This is official business. LFG commands only! \`?bounty\`, \`?legendary\``); setTimeout(() => w.delete().catch(() => {}), 10000); } catch (e) {}
    return;
  }

  // Commands
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    if (cmd === 'help') {
      const embed = new EmbedBuilder().setTitle('⭐ Police Chief - Bounty Coordinator').setDescription("*tips hat* Here's how this works...").addFields(
        { name: '🎯 Looking For Group', value: '`?bounty` - Bounty hunting posse\n`?legendary` - Legendary bounty run' },
        { name: '🎙️ Voice', value: '`?voice join` / `?voice leave`' }
      ).setColor(0xFFD700).setFooter({ text: 'ULTIMATE Edition' });
      await message.reply({ embeds: [embed] });
      return;
    }
    if (cmd === 'ping') { await message.reply(`*adjusts badge* System operational. ${client.ws.ping}ms.`); return; }
    if (cmd === 'voice') {
      if (!voiceSystem) return message.reply("Voice system offline.");
      if (args[0] === 'join') { const vc = message.member.voice.channel; if (!vc) return message.reply("Get in a voice channel first."); const ok = await voiceChatHandler?.joinAndGreet(vc); message.reply(ok ? `🎙️ Joining ${vc.name}` : "Can't join."); }
      else if (args[0] === 'leave') { voiceSystem.leaveChannel(); message.reply("*disconnects radio*"); }
      return;
    }
  }

  if (await checkShouldRespond(message)) await generateResponse(message);
});

client.on(Events.InteractionCreate, async (i) => { if (i.isButton() && i.customId.startsWith('lfg_') && nexusLFG) await nexusLFG.handleButton(i); });
client.on(Events.MessageReactionAdd, async (r, u) => { if (u.bot) return; if (r.partial) try { await r.fetch(); } catch (e) { return; } if (nexusLFG) await nexusLFG.handleReaction(r, u); if (intelligence && r.message.author?.id === client.user.id) await intelligence.handleReaction(r.message.id, r.emoji.name, u.id); });
client.on(Events.VoiceStateUpdate, (o, n) => { if (intelligence?.contextAwareness && n.guild) intelligence.contextAwareness.updateVoiceState(n.guild.id, n); });

client.on('error', console.error);
process.on('unhandledRejection', console.error);
client.login(process.env.DISCORD_TOKEN);
