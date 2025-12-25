/**
 * POLICE CHIEF - THE LAWMAN | Hive Mind Connected
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

const { getHiveMind } = require('./shared/hivemind/hiveMind');
const { getMemoryCore } = require('./shared/hivemind/memoryCore');
const { NaturalResponse } = require('./shared/hivemind/naturalResponse');
const { MoodEngine } = require('./shared/hivemind/moodEngine');
const { ServerAwareness } = require('./shared/hivemind/serverAwareness');
const { GrudgeSystem } = require('./shared/hivemind/grudgeSystem');
const advancedBountyLFG = require('./shared/advancedBountyLFG');

const BOT_ID = 'chief';

const CHIEF_PERSONALITY = `You are the Sheriff/Police Chief from Red Dead Online. Stern lawman.

PERSONALITY: Stern but fair, suspicious of everyone, respects good hunters, dry humor.

VOICE: Professional lawman. Direct. Brief. References "the law" and "justice".

RULES:
- SHORT responses
- Direct and authoritative
- Keeps files on everyone
- Suspicious undertone

EXAMPLES:
- "*tips hat* what brings you here"
- "i've got my eye on you"
- "justice doesn't sleep. neither do i"
- "interesting. very interesting."
- "don't make me regret this"
- "bounty board's over there"`;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Message, Partials.Channel]
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

let hiveMind, memoryCore, naturalResponse, moodEngine, serverAwareness, grudgeSystem;

client.once(Events.ClientReady, async () => {
  console.log(`[CHIEF] ✅ Online`);
  
  hiveMind = getHiveMind({ pool });
  memoryCore = getMemoryCore(pool);
  naturalResponse = new NaturalResponse(anthropic);
  moodEngine = new MoodEngine(pool, BOT_ID);
  serverAwareness = new ServerAwareness(client);
  grudgeSystem = new GrudgeSystem(pool);
  
  await memoryCore.initialize();
  await moodEngine.initialize();
  await grudgeSystem.initialize();
  
  hiveMind.registerBot(BOT_ID, client, CHIEF_PERSONALITY);
  await moodEngine.loadMood();
  
  advancedBountyLFG.initialize(client);
  client.user.setPresence({ activities: [{ name: 'Keeping the peace', type: 3 }], status: 'online' });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.id === client.user.id) return;
  if (!message.author.bot) await serverAwareness.recordMessage(message);
  
  if (message.content.startsWith('?')) {
    const cmd = message.content.slice(1).split(' ')[0].toLowerCase();
    if (['bounty', 'hunt', 'legendary'].includes(cmd)) {
      if (!message.channel.name.includes('bounty') && !message.channel.name.includes('lfg')) {
        await message.delete().catch(() => {});
        await message.author.send({ embeds: [{ title: '💀 Wrong Channel', description: 'Use #bounty-lfg', color: 0x8B0000 }] }).catch(() => {});
        return;
      }
      await advancedBountyLFG.createSession(message, client);
      return;
    }
  }
  
  const decision = await hiveMind.processMessage(message, BOT_ID);
  if (!decision.shouldRespond) return;
  
  await message.channel.sendTyping();
  const context = await memoryCore.buildMemoryContext(BOT_ID, message.author.id);
  const response = await naturalResponse.generateResponse(BOT_ID, CHIEF_PERSONALITY, message, decision.style, context);
  await new Promise(r => setTimeout(r, response.length * 25));
  await message.reply(response);
  await memoryCore.storeConversation(BOT_ID, message.author.id, message.channel.id, message.channel.name, message.content, response);
  hiveMind.recordBotResponse(BOT_ID);
});

client.login(process.env.DISCORD_TOKEN);
