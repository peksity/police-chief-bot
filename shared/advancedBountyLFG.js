/**
 * ADVANCED BOUNTY LFG - LAWMAN EDITION
 * Features: Timer-based payouts, difficulty scaling, bounty counter, in-channel setup
 * 
 * KEY INFO:
 * - Payouts scale by TIME, not difficulty alone
 * - 12 min is the sweet spot (best gold/time ratio)
 * - Everyone gets SAME payout (no split!)
 * - Legendary 5-star = best cash, Regular = best gold farming
 */

const { 
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
  TextInputStyle, ChannelType
} = require('discord.js');

const COLORS = { wanted: 0x8B0000, badge: 0xFFD700, success: 0x00FF88, danger: 0xFF3366 };

// Bounty types
const BOUNTY_TYPES = {
  regular: { 
    name: 'Regular Bounty', 
    emoji: '📜',
    description: 'Board bounties - best for gold farming',
    payouts: {
      '5min': { cash: 15, gold: 0.08 },
      '10min': { cash: 30, gold: 0.16 },
      '12min': { cash: 40, gold: 0.24 },
      '15min': { cash: 50, gold: 0.32 }
    }
  },
  legendary: { 
    name: 'Legendary Bounty', 
    emoji: '⭐',
    description: 'Named targets - best for cash',
    payouts: {
      '1star': { cash: 50, gold: 0.24 },
      '2star': { cash: 70, gold: 0.24 },
      '3star': { cash: 90, gold: 0.24 },
      '4star': { cash: 120, gold: 0.24 },
      '5star': { cash: 170, gold: 0.32 }
    }
  }
};

// Legendary targets with tips
const LEGENDARY_TARGETS = {
  etta_doyle: { name: 'Etta Doyle', emoji: '👩', difficulty: '⭐⭐', cash: 225, tip: '💡 EASIEST! Wait for "It\'s a setup!" then grab her while gang ignores you' },
  red_ben: { name: 'Red Ben Clempson', emoji: '🚂', difficulty: '⭐⭐⭐', cash: 225, tip: '💡 Train heist - $225 max payout - bring explosives' },
  tobin_winfield: { name: 'Tobin Winfield', emoji: '⛏️', difficulty: '⭐⭐⭐', cash: 225, tip: '💡 Mine chase - $225 max payout - one of the best!' },
  yukon_nik: { name: 'Yukon Nik', emoji: '❄️', difficulty: '⭐⭐⭐', cash: 187, tip: '💡 Cold weather - good for AFK grinding' },
  cecil_tucker: { name: 'Cecil C. Tucker', emoji: '🎭', difficulty: '⭐⭐⭐', cash: 187, tip: '💡 Theater showdown' },
  sergio_vincenza: { name: 'Sergio Vincenza', emoji: '🎨', difficulty: '⭐⭐⭐⭐', cash: 187, tip: '💡 Art thief - multiple locations' },
  owlhoot: { name: 'Owlhoot Family', emoji: '🦉', difficulty: '⭐⭐⭐⭐', cash: 200, tip: '💡 Family gang - lots of enemies to kill for XP' },
  wolf_man: { name: 'Wolf Man', emoji: '🐺', difficulty: '⭐⭐⭐⭐⭐', cash: 200, tip: '💡 HARDEST - wolves + enemies - high risk high reward' },
  gene_beau: { name: 'Gene "Beau" Finley', emoji: '🤵', difficulty: '⭐⭐⭐', cash: 187, tip: '💡 Gentleman outlaw' },
  philip_carlier: { name: 'Philip Carlier', emoji: '🐊', difficulty: '⭐⭐⭐⭐', cash: 187, tip: '💡 Swamp hunter' }
};

// AFK Tips
const AFK_TIP = `📖 **IMPORTANT:** Open your CATALOGUE to prevent being kicked for inactivity while waiting!`;

// Timer strategies
const STRATEGIES = {
  speed: { name: 'Speed Run', emoji: '⚡', time: '5-7 min', desc: 'Fast but less pay' },
  optimal: { name: '12 Min (Optimal)', emoji: '⏱️', time: '12 min', desc: 'Best gold/time ratio' },
  max: { name: 'Max Timer', emoji: '💰', time: '15-20 min', desc: 'More payout, slower' },
  afk: { name: 'AFK Grind', emoji: '😴', time: '30+ min', desc: 'Max payout while AFK' }
};

// Extended gold payouts by time
const GOLD_BY_TIME = {
  5: 0.08,
  10: 0.16,
  12: 0.24,
  15: 0.32,
  20: 0.36,
  25: 0.40,
  30: 0.48,
  45: 0.54,
  60: 0.60
};

const PLATFORMS = {
  ps5: { name: 'PlayStation 5', short: 'PS5' },
  ps4: { name: 'PlayStation 4', short: 'PS4' },
  crossgen: { name: 'Cross-Gen', short: 'CROSS' }
};

let pool = null;
let blacklistSystem = null;
const activeSessions = new Map();
const setupSessions = new Map();

function initialize(client, dbPool) {
  pool = dbPool;
  try {
    const { getBlacklistSystem } = require('./blacklistSystem');
    blacklistSystem = getBlacklistSystem(pool);
    blacklistSystem.initialize();
  } catch (e) {}
  client.on('interactionCreate', handleInteraction);
  console.log('[BOUNTY LFG] ✅ Initialized with timer-based payouts');
}

async function createSession(message, client) {
  const userId = message.author.id;
  if (activeSessions.has(userId)) {
    const reply = await message.reply('❌ You already have an active bounty hunt.');
    setTimeout(() => reply.delete().catch(() => {}), 5000);
    return;
  }

  await message.delete().catch(() => {});

  const setupId = `bounty_setup_${userId}_${Date.now()}`;
  setupSessions.set(setupId, {
    hostId: userId, hostUsername: message.author.username,
    channelId: message.channel.id, guildId: message.guild.id,
    step: 1, data: {}, messageId: null
  });

  const setupMsg = await message.channel.send({
    content: `<@${userId}> **Setting up bounty hunt...** *(only you can interact)*`,
    embeds: [createSetupEmbed(1, {})],
    components: [createPlatformSelect(setupId)]
  });
  
  setupSessions.get(setupId).messageId = setupMsg.id;
  setTimeout(async () => {
    if (setupSessions.has(setupId)) {
      setupSessions.delete(setupId);
      await setupMsg.delete().catch(() => {});
    }
  }, 120000);
}

function createSetupEmbed(step, data) {
  const progress = '▰'.repeat(step) + '▱'.repeat(6 - step);
  const embed = new EmbedBuilder().setTitle('💀 BOUNTY HUNT SETUP').setColor(COLORS.wanted).setFooter({ text: `Step ${step}/6 • Everyone gets SAME payout (no split!)` });
  
  let desc = `\`${progress}\`\n\n`;
  
  if (step === 1) {
    desc += '**SELECT PLATFORM**';
  } else if (step === 3) {
    desc += '**SELECT BOUNTY TYPE**\n\n';
    desc += '📜 **Regular Bounty** - Board missions\n';
    desc += '> Best for gold farming\n';
    desc += '> ~$40 + 0.24 gold at 12 min\n\n';
    desc += '⭐ **Legendary Bounty** - Named targets\n';
    desc += '> Best for cash\n';
    desc += '> ~$170 + 0.32 gold at 5-star\n';
  } else if (step === 4 && data.bountyType === 'legendary') {
    desc += '**SELECT LEGENDARY TARGET**\n\n';
    desc += '👩 **Etta Doyle** ⭐⭐ - Easiest!\n';
    desc += '🚂 **Red Ben** ⭐⭐⭐ - Train heist\n';
    desc += '🦉 **Owlhoot Family** ⭐⭐⭐⭐ - Gang\n';
    desc += '🐺 **Wolf Man** ⭐⭐⭐⭐⭐ - Hardest\n';
  } else if (step === 4 && data.bountyType === 'regular') {
    desc += '**SELECT TIMER STRATEGY**\n\n';
    desc += '⚡ **Speed Run** (5-7 min)\n';
    desc += '> ~$15 + 0.08 gold | Fast but less pay\n\n';
    desc += '⏱️ **12 Min Optimal** *(Recommended)*\n';
    desc += '> ~$40 + 0.24 gold | Best gold/time ratio\n\n';
    desc += '💰 **Max Timer** (15-20 min)\n';
    desc += '> ~$50 + 0.36 gold | More payout\n\n';
    desc += '😴 **AFK Grind** (30+ min)\n';
    desc += '> ~$60 + 0.48 gold | Max payout while AFK\n';
    desc += '> 📖 *Open CATALOGUE to stay in game!*\n';
  } else if (step === 5) {
    desc += '**SELECT DIFFICULTY** (Legendary)\n\n';
    desc += '⭐ - ~$50-75 + 0.24 gold\n';
    desc += '⭐⭐ - ~$70-100 + 0.24 gold\n';
    desc += '⭐⭐⭐ - ~$90-140 + 0.24 gold\n';
    desc += '⭐⭐⭐⭐ - ~$120-175 + 0.32 gold\n';
    desc += '⭐⭐⭐⭐⭐ - ~$150-225 + 0.48 gold *(Best)*\n\n';
    desc += '**💰 30 MIN AFK PAYOUTS (5-Star):**\n';
    desc += '> Etta/Red Ben/Tobin: **$225 + 0.48 gold**\n';
    desc += '> Others: **$187-200 + 0.48 gold**\n\n';
    desc += '📖 *Open CATALOGUE to prevent AFK kick!*\n';
  } else if (step === 6) {
    const bountyType = BOUNTY_TYPES[data.bountyType];
    desc += '**READY TO POST**\n\n';
    desc += `📍 **Platform:** ${PLATFORMS[data.platform]?.name}\n`;
    desc += `🎮 **PSN:** \`${data.psn}\`\n`;
    desc += `${bountyType?.emoji} **Type:** ${bountyType?.name}\n`;
    
    if (data.bountyType === 'legendary' && data.target) {
      const target = LEGENDARY_TARGETS[data.target];
      desc += `🎯 **Target:** ${target?.name} (${target?.difficulty})\n`;
      desc += `⭐ **Difficulty:** ${data.difficulty}-star\n`;
      const payout = bountyType.payouts[`${data.difficulty}star`];
      desc += `\n**💰 Estimated Payout (each person):**\n`;
      desc += `> Cash: ~$${payout?.cash}\n`;
      desc += `> Gold: ~${payout?.gold}\n`;
    } else {
      const strategy = STRATEGIES[data.strategy];
      desc += `⏱️ **Strategy:** ${strategy?.name}\n`;
      desc += `\n**💰 Estimated Payout (each person):**\n`;
      const payout = bountyType.payouts[data.strategy === 'speed' ? '5min' : data.strategy === 'optimal' ? '12min' : '15min'];
      desc += `> Cash: ~$${payout?.cash}\n`;
      desc += `> Gold: ~${payout?.gold}\n`;
    }
    desc += `\n✅ **Everyone gets same payout - no split!**`;
  }
  
  embed.setDescription(desc);
  return embed;
}

function createPlatformSelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bounty_platform_${setupId}`).setPlaceholder('🎮 Platform')
      .addOptions([
        { label: 'PlayStation 5', value: 'ps5', emoji: '🎮' },
        { label: 'PlayStation 4', value: 'ps4', emoji: '🎮' },
        { label: 'Cross-Gen', value: 'crossgen', emoji: '🔄' }
      ])
  );
}

function createBountyTypeSelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bounty_type_${setupId}`).setPlaceholder('💀 Bounty Type')
      .addOptions([
        { label: 'Regular Bounty - Best for Gold', value: 'regular', emoji: '📜', description: '~$40 + 0.24 gold at 12 min' },
        { label: 'Legendary Bounty - Best for Cash', value: 'legendary', emoji: '⭐', description: '~$170 + 0.32 gold at 5-star' }
      ])
  );
}

function createTargetSelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bounty_target_${setupId}`).setPlaceholder('🎯 Select Target')
      .addOptions([
        { label: 'Etta Doyle ($225) ⭐ EASIEST', value: 'etta_doyle', emoji: '👩', description: 'Wait for "It\'s a setup!" - best for AFK' },
        { label: 'Red Ben Clempson ($225)', value: 'red_ben', emoji: '🚂', description: '⭐⭐⭐ - Train heist - top payout' },
        { label: 'Tobin Winfield ($225)', value: 'tobin_winfield', emoji: '⛏️', description: '⭐⭐⭐ - Mine chase - top payout' },
        { label: 'Yukon Nik ($187)', value: 'yukon_nik', emoji: '❄️', description: '⭐⭐⭐ - Cold weather' },
        { label: 'Cecil C. Tucker ($187)', value: 'cecil_tucker', emoji: '🎭', description: '⭐⭐⭐ - Theater' },
        { label: 'Owlhoot Family ($200)', value: 'owlhoot', emoji: '🦉', description: '⭐⭐⭐⭐ - Gang fight - lots of XP' },
        { label: 'Wolf Man ($200) ⚠️ HARDEST', value: 'wolf_man', emoji: '🐺', description: '⭐⭐⭐⭐⭐ - Wolves + enemies' }
      ])
  );
}

function createStrategySelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bounty_strategy_${setupId}`).setPlaceholder('⏱️ Timer Strategy')
      .addOptions([
        { label: 'Speed Run (5-7 min)', value: 'speed', emoji: '⚡', description: '~$15 + 0.08 gold - Fast' },
        { label: '12 Min Optimal (Recommended)', value: 'optimal', emoji: '⏱️', description: '~$40 + 0.24 gold - Best ratio' },
        { label: 'Max Timer (15-20 min)', value: 'max', emoji: '💰', description: '~$50 + 0.36 gold - More pay' },
        { label: 'AFK Grind (30+ min)', value: 'afk', emoji: '😴', description: '~$60 + 0.48 gold - Open catalogue!' }
      ])
  );
}

function createDifficultySelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bounty_difficulty_${setupId}`).setPlaceholder('⭐ Difficulty')
      .addOptions([
        { label: '1 Star', value: '1', emoji: '⭐', description: '~$50 + 0.24 gold' },
        { label: '2 Star', value: '2', emoji: '⭐', description: '~$70 + 0.24 gold' },
        { label: '3 Star', value: '3', emoji: '⭐', description: '~$90 + 0.24 gold' },
        { label: '4 Star', value: '4', emoji: '⭐', description: '~$120 + 0.24 gold' },
        { label: '5 Star (Best Cash)', value: '5', emoji: '⭐', description: '~$170 + 0.32 gold' }
      ])
  );
}

function createFinalOptions(setupId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bounty_voice_on_${setupId}`).setLabel('🔊 Voice').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bounty_voice_off_${setupId}`).setLabel('🔇 No Voice').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bounty_start_${setupId}`).setLabel('🚀 POST BOUNTY').setStyle(ButtonStyle.Success)
    )
  ];
}

async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith('bounty_')) return;
  const parts = interaction.customId.split('_');
  const action = parts[1];
  
  try {
    if (action === 'platform') await handlePlatform(interaction);
    else if (action === 'type') await handleType(interaction);
    else if (action === 'target') await handleTarget(interaction);
    else if (action === 'strategy') await handleStrategy(interaction);
    else if (action === 'difficulty') await handleDifficulty(interaction);
    else if (action === 'voice') await handleVoice(interaction, parts[2] === 'on');
    else if (action === 'start') await handleStart(interaction);
    else if (action === 'join') await handleJoin(interaction);
    else if (action === 'leave') await handleLeave(interaction);
    else if (action === 'voicebtn') await handleVoiceBtn(interaction);
    else if (action === 'startrun') await handleStartRun(interaction);
    else if (action === 'done') await handleDone(interaction);
    else if (action === 'end') await handleEnd(interaction);
    else if (action === 'kick') await handleKick(interaction, parts[2]);
  } catch (e) { console.error('[BOUNTY]', e); }
}

function getSetupId(customId) { return customId.split('_').slice(2).join('_'); }
function getSessionId(customId) { return customId.split('_').slice(2).join('_'); }

async function handlePlatform(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  setup.data.platform = interaction.values[0];
  
  const modal = new ModalBuilder().setCustomId(`bounty_psn_${setupId}`).setTitle('Enter PSN')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('psn').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true)));
  await interaction.showModal(modal);
  
  try {
    const m = await interaction.awaitModalSubmit({ filter: i => i.customId === `bounty_psn_${setupId}`, time: 60000 });
    setup.data.psn = m.fields.getTextInputValue('psn');
    setup.step = 3;
    await m.update({ embeds: [createSetupEmbed(3, setup.data)], components: [createBountyTypeSelect(setupId)] });
  } catch (e) {}
}

async function handleType(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  setup.data.bountyType = interaction.values[0];
  setup.step = 4;
  
  if (setup.data.bountyType === 'legendary') {
    await interaction.update({ embeds: [createSetupEmbed(4, setup.data)], components: [createTargetSelect(setupId)] });
  } else {
    await interaction.update({ embeds: [createSetupEmbed(4, setup.data)], components: [createStrategySelect(setupId)] });
  }
}

async function handleTarget(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  setup.data.target = interaction.values[0];
  setup.step = 5;
  await interaction.update({ embeds: [createSetupEmbed(5, setup.data)], components: [createDifficultySelect(setupId)] });
}

async function handleStrategy(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  setup.data.strategy = interaction.values[0];
  setup.data.voice = false;
  setup.step = 6;
  await interaction.update({ embeds: [createSetupEmbed(6, setup.data)], components: createFinalOptions(setupId) });
}

async function handleDifficulty(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  setup.data.difficulty = interaction.values[0];
  setup.data.voice = false;
  setup.step = 6;
  await interaction.update({ embeds: [createSetupEmbed(6, setup.data)], components: createFinalOptions(setupId) });
}

async function handleVoice(interaction, isOn) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  setup.data.voice = isOn;
  await interaction.update({ embeds: [createSetupEmbed(6, setup.data)], components: createFinalOptions(setupId) });
}

async function handleStart(interaction) {
  const setupId = getSetupId(interaction.customId);
  const setup = setupSessions.get(setupId);
  if (!setup || setup.hostId !== interaction.user.id) return interaction.reply({ content: '❌ Not your setup.', ephemeral: true });
  
  const sessionId = `bounty_${Date.now()}_${setup.hostId.slice(-4)}`;
  
  // Calculate expected payout
  let expectedCash = 40, expectedGold = 0.24;
  if (setup.data.bountyType === 'legendary') {
    const target = LEGENDARY_TARGETS[setup.data.target];
    const difficulty = parseInt(setup.data.difficulty);
    // Base cash scales with difficulty, max at 5 star after 30 min
    const diffMultiplier = [0.33, 0.47, 0.6, 0.8, 1.0][difficulty - 1];
    expectedCash = Math.floor(target.cash * diffMultiplier);
    expectedGold = difficulty >= 5 ? 0.48 : difficulty >= 4 ? 0.32 : 0.24;
  } else {
    // Regular bounty payouts by strategy
    const payouts = {
      speed: { cash: 15, gold: 0.08 },
      optimal: { cash: 40, gold: 0.24 },
      max: { cash: 50, gold: 0.36 },
      afk: { cash: 60, gold: 0.48 }
    };
    const payout = payouts[setup.data.strategy] || payouts.optimal;
    expectedCash = payout.cash;
    expectedGold = payout.gold;
  }
  
  let voiceChannel = null;
  if (setup.data.voice) {
    try {
      const guild = interaction.guild;
      const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('red dead') || c.name.toLowerCase().includes('rdo')));
      voiceChannel = await guild.channels.create({ name: `💀 ${setup.hostUsername}'s Hunt`, type: ChannelType.GuildVoice, parent: category?.id, userLimit: 7 });
    } catch (e) {}
  }
  
  const session = {
    id: sessionId, hostId: setup.hostId, hostUsername: setup.hostUsername, hostPsn: setup.data.psn,
    platform: setup.data.platform, bountyType: setup.data.bountyType, target: setup.data.target,
    difficulty: setup.data.difficulty, strategy: setup.data.strategy,
    expectedCash, expectedGold,
    crew: [], status: 'recruiting', voiceChannelId: voiceChannel?.id, createdAt: Date.now(),
    channelId: setup.channelId, messageId: null, bountyCount: 0, totalCash: 0, totalGold: 0
  };
  
  try { await interaction.message.delete(); } catch (e) {}
  
  const lfgChannel = interaction.channel;
  const pingRole = lfgChannel.guild.roles.cache.find(r => r.name.toLowerCase().includes('bounty'));
  
  const lfgMessage = await lfgChannel.send({
    content: pingRole ? `<@&${pingRole.id}>` : '💀 **New Bounty Hunt!**',
    embeds: [createMainEmbed(session)],
    components: createSessionControls(session)
  });
  
  session.messageId = lfgMessage.id;
  activeSessions.set(setup.hostId, session);
  activeSessions.set(sessionId, session);
  setupSessions.delete(setupId);
  
  await interaction.reply({ content: '✅ **Bounty posted!**', ephemeral: true });
}

function createMainEmbed(session) {
  const bountyType = BOUNTY_TYPES[session.bountyType];
  const platform = PLATFORMS[session.platform];
  const crewSize = session.crew.length + 1;
  
  // Build description
  let typeInfo = bountyType.emoji + ' ' + bountyType.name;
  if (session.bountyType === 'legendary' && session.target) {
    const target = LEGENDARY_TARGETS[session.target];
    typeInfo = `${target.emoji} ${target.name} | ${'⭐'.repeat(parseInt(session.difficulty))}`;
  } else if (session.strategy) {
    const strategy = STRATEGIES[session.strategy];
    typeInfo += ` | ${strategy.emoji} ${strategy.name}`;
  }
  
  // Build posse list
  let posseList = `1.👑 **${session.hostUsername}** \`${session.hostPsn}\`\n`;
  for (let i = 0; i < 6; i++) {
    if (session.crew[i]) {
      posseList += `${i + 2}. ${session.crew[i].username} \`${session.crew[i].psn}\`\n`;
    } else {
      posseList += `${i + 2}. 🟢 *Open*\n`;
    }
  }
  
  // Payout info
  let payoutInfo = `**Per Person:**\n`;
  payoutInfo += `💵 ~$${session.expectedCash}\n`;
  payoutInfo += `🪙 ~${session.expectedGold} gold\n\n`;
  payoutInfo += `✅ *Same for everyone!*`;
  
  if (session.bountyCount > 0) {
    payoutInfo += `\n\n**Session Total:**\n`;
    payoutInfo += `🎯 Bounties: ${session.bountyCount}\n`;
    payoutInfo += `💰 Cash: $${session.totalCash}\n`;
    payoutInfo += `🪙 Gold: ${session.totalGold.toFixed(2)}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`💀 BOUNTY HUNT - ${session.status.toUpperCase()}`)
    .setDescription(`**Host:** ${session.hostUsername} \`${session.hostPsn}\`\n${typeInfo}`)
    .addFields(
      { name: `🤠 Posse (${crewSize}/7)`, value: posseList, inline: true },
      { name: '💰 Payouts', value: payoutInfo, inline: true }
    )
    .setColor(session.status === 'recruiting' ? COLORS.wanted : session.status === 'in_progress' ? COLORS.badge : COLORS.success)
    .setFooter({ text: `${platform.short} • ${getTimeAgo(session.createdAt)} • ⏱️ Turn in at 12 min for best gold/time` });

  // Add tip for legendary
  if (session.bountyType === 'legendary' && session.target) {
    const target = LEGENDARY_TARGETS[session.target];
    if (target?.tip) {
      embed.addFields({ name: '💡 Tip', value: target.tip + '\n\n📖 **AFK?** Open CATALOGUE to stay in game!', inline: false });
    }
  } else if (session.strategy === 'afk') {
    embed.addFields({ name: '📖 AFK TIP', value: '**Open your CATALOGUE** to prevent being kicked for inactivity while waiting for the timer!', inline: false });
  }

  return embed;
}

function createSessionControls(session) {
  const rows = [];
  
  // Row 1: Join/Leave/Voice
  const row1 = new ActionRowBuilder();
  if (session.status === 'recruiting' && session.crew.length < 6) {
    row1.addComponents(new ButtonBuilder().setCustomId(`bounty_join_${session.id}`).setLabel('Join').setStyle(ButtonStyle.Success).setEmoji('🎯'));
  }
  row1.addComponents(
    new ButtonBuilder().setCustomId(`bounty_leave_${session.id}`).setLabel('Leave').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
    new ButtonBuilder().setCustomId(`bounty_voicebtn_${session.id}`).setLabel('Voice').setStyle(ButtonStyle.Primary).setEmoji('🔊')
  );
  rows.push(row1);
  
  // Row 2: Host controls
  const row2 = new ActionRowBuilder();
  if (session.status === 'recruiting') {
    row2.addComponents(new ButtonBuilder().setCustomId(`bounty_startrun_${session.id}`).setLabel('Start Hunt').setStyle(ButtonStyle.Primary).setEmoji('🚀'));
  }
  if (session.status === 'in_progress') {
    row2.addComponents(new ButtonBuilder().setCustomId(`bounty_done_${session.id}`).setLabel('Done').setStyle(ButtonStyle.Success).setEmoji('✅'));
  }
  row2.addComponents(new ButtonBuilder().setCustomId(`bounty_end_${session.id}`).setLabel('End').setStyle(ButtonStyle.Danger).setEmoji('⭕'));
  rows.push(row2);
  
  return rows;
}

async function handleJoin(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  if (session.hostId === interaction.user.id) return interaction.reply({ content: '❌ You\'re the host!', ephemeral: true });
  if (session.crew.some(c => c.userId === interaction.user.id)) return interaction.reply({ content: '❌ Already in!', ephemeral: true });
  if (session.crew.length >= 6) return interaction.reply({ content: '❌ Full! (7/7)', ephemeral: true });
  if (blacklistSystem && await blacklistSystem.isBlacklisted(session.hostId, interaction.user.id)) return interaction.reply({ content: '🚫 Blacklisted.', ephemeral: true });
  
  const modal = new ModalBuilder().setCustomId(`bounty_joinpsn_${sessionId}`).setTitle('Join Hunt')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('psn').setLabel('Your PSN').setStyle(TextInputStyle.Short).setRequired(true)));
  await interaction.showModal(modal);
  
  try {
    const m = await interaction.awaitModalSubmit({ filter: i => i.customId === `bounty_joinpsn_${sessionId}`, time: 60000 });
    session.crew.push({ userId: m.user.id, username: m.user.username, psn: m.fields.getTextInputValue('psn'), joinedAt: Date.now() });
    await updateSession(interaction.client, session);
    
    const channel = interaction.client.channels.cache.get(session.channelId);
    await channel.send(`🎯 **${m.user.username}** joined the hunt! (${session.crew.length + 1}/7)`);
    
    await m.reply({ content: '✅ Joined!', ephemeral: true });
  } catch (e) {}
}

async function handleLeave(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  
  const idx = session.crew.findIndex(c => c.userId === interaction.user.id);
  if (idx === -1) return interaction.reply({ content: '❌ You\'re not in this hunt.', ephemeral: true });
  
  const left = session.crew.splice(idx, 1)[0];
  await updateSession(interaction.client, session);
  
  const channel = interaction.client.channels.cache.get(session.channelId);
  await channel.send(`🚪 **${left.username}** left the hunt.`);
  
  await interaction.reply({ content: '✅ Left the hunt.', ephemeral: true });
}

async function handleVoiceBtn(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  
  if (session.voiceChannelId) {
    await interaction.reply({ content: `🔊 Join voice: <#${session.voiceChannelId}>`, ephemeral: true });
  } else {
    await interaction.reply({ content: '❌ No voice channel for this session.', ephemeral: true });
  }
}

async function handleStartRun(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  if (interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  session.status = 'in_progress';
  await updateSession(interaction.client, session);
  
  const channel = interaction.client.channels.cache.get(session.channelId);
  let msg = `🚀 **${session.hostUsername}** is starting the hunt!`;
  if (session.bountyType === 'legendary' && session.target) {
    const target = LEGENDARY_TARGETS[session.target];
    msg += ` | ${target.emoji} ${target.name}`;
  }
  msg += ` | ⏱️ Turn in at 12 min for best payout!`;
  await channel.send(msg);
  
  await interaction.reply({ content: '🚀 Hunt started!', ephemeral: true });
}

async function handleDone(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  if (interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  session.bountyCount++;
  session.totalCash += session.expectedCash;
  session.totalGold += session.expectedGold;
  
  await updateSession(interaction.client, session);
  
  const channel = interaction.client.channels.cache.get(session.channelId);
  await channel.send(`🎯 **BOUNTY #${session.bountyCount} COMPLETE!** +$${session.expectedCash} +${session.expectedGold} gold | Total: $${session.totalCash} + ${session.totalGold.toFixed(2)} gold`);
  
  await interaction.reply({ content: `✅ Bounty #${session.bountyCount} done!`, ephemeral: true });
}

async function handleEnd(interaction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session ended.', ephemeral: true });
  if (interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  if (session.voiceChannelId) {
    try { await interaction.client.channels.cache.get(session.voiceChannelId)?.delete(); } catch (e) {}
  }
  
  try {
    const ch = interaction.client.channels.cache.get(session.channelId);
    const msg = await ch.messages.fetch(session.messageId);
    
    let summary = `**Host:** <@${session.hostId}>\n`;
    summary += `**Posse:** ${session.crew.map(c => `<@${c.userId}>`).join(', ') || 'Solo'}\n\n`;
    if (session.bountyCount > 0) {
      summary += `🎯 **Bounties:** ${session.bountyCount}\n`;
      summary += `💰 **Total Cash:** $${session.totalCash}\n`;
      summary += `🪙 **Total Gold:** ${session.totalGold.toFixed(2)}`;
    }
    
    await msg.edit({ embeds: [new EmbedBuilder().setTitle('🏆 HUNT SESSION COMPLETE').setDescription(summary).setColor(COLORS.success)], components: [] });
  } catch (e) {}
  
  activeSessions.delete(sessionId);
  activeSessions.delete(session.hostId);
  
  await interaction.reply({ content: `🏆 Session ended! ${session.bountyCount > 0 ? `Bounties: ${session.bountyCount}, Cash: $${session.totalCash}, Gold: ${session.totalGold.toFixed(2)}` : ''}`, ephemeral: true });
}

async function handleKick(interaction, subAction) {
  const sessionId = getSessionId(interaction.customId);
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  if (subAction === 'menu') {
    if (!session.crew.length) return interaction.reply({ content: '❌ No crew.', ephemeral: true });
    const select = new StringSelectMenuBuilder().setCustomId(`bounty_kick_sel_${sessionId}`).setPlaceholder('Kick who?')
      .addOptions(session.crew.map(c => ({ label: c.username, value: c.userId })));
    await interaction.reply({ content: '👢 Select:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    
    try {
      const s = await interaction.channel.awaitMessageComponent({ filter: i => i.customId === `bounty_kick_sel_${sessionId}`, time: 30000 });
      const kicked = session.crew.find(c => c.userId === s.values[0]);
      session.crew = session.crew.filter(c => c.userId !== s.values[0]);
      await updateSession(interaction.client, session);
      
      const channel = interaction.client.channels.cache.get(session.channelId);
      await channel.send(`👢 **${kicked.username}** was removed from the hunt.`);
      
      if (blacklistSystem) {
        const { embed, row } = blacklistSystem.createBlacklistPrompt(session.hostId, kicked.userId, kicked.username);
        await s.update({ embeds: [embed], components: [row] });
      } else await s.update({ content: `✅ Kicked ${kicked.username}`, components: [] });
    } catch (e) {}
  }
}

async function updateSession(client, session) {
  try { 
    const ch = client.channels.cache.get(session.channelId); 
    const msg = await ch.messages.fetch(session.messageId); 
    await msg.edit({ embeds: [createMainEmbed(session)], components: createSessionControls(session) }); 
  } catch (e) {}
}

function getTimeAgo(ts) { 
  const m = Math.floor((Date.now() - ts) / 60000); 
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.floor(m/60)}h ago`; 
}

module.exports = { initialize, createSession };
