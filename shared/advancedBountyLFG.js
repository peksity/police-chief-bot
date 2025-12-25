/**
 * ADVANCED BOUNTY HUNTER LFG - LAWMAN EDITION
 */

const { 
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, 
  TextInputStyle, ChannelType
} = require('discord.js');

const COLORS = {
  wanted: 0x8B0000,
  badge: 0xFFD700,
  success: 0x00FF88,
  danger: 0xFF3366
};

const activeSessions = new Map();
const setupSessions = new Map();

const BOUNTY_TYPES = {
  regular: { name: 'Regular Bounty', emoji: '💰', description: 'Standard bounty poster' },
  legendary: { name: 'Legendary Bounty', emoji: '⭐', description: 'High-value target' },
  infamous: { name: 'Infamous Bounty', emoji: '💀', description: 'Weekly rotating target' }
};

const LEGENDARY_TARGETS = {
  etta_doyle: { name: 'Etta Doyle', emoji: '👩', difficulty: '⭐⭐', gold: 0.48, cash: 225, strategy: 'Wait for "It\'s a setup!"' },
  red_ben: { name: 'Red Ben Clempson', emoji: '🚂', difficulty: '⭐⭐⭐', gold: 0.48, cash: 187 },
  yukon_nik: { name: 'Yukon Nik', emoji: '❄️', difficulty: '⭐⭐⭐', gold: 0.48, cash: 187 },
  owlhoot: { name: 'The Owlhoot Family', emoji: '🦉', difficulty: '⭐⭐⭐⭐', gold: 0.48, cash: 225 },
  wolf_man: { name: 'The Wolf Man', emoji: '🐺', difficulty: '⭐⭐⭐⭐', gold: 0.48, cash: 225 }
};

const STRATEGIES = {
  speed: { name: 'Speed Run', emoji: '⚡', description: 'Fast, less payout' },
  timer: { name: 'Timer Method', emoji: '⏱️', description: '30min for max gold' },
  fun: { name: 'Just for Fun', emoji: '🎮', description: 'No pressure' }
};

const PLATFORMS = {
  ps5: { name: 'PlayStation 5', short: 'PS5' },
  ps4: { name: 'PlayStation 4', short: 'PS4' },
  crossgen: { name: 'Cross-Gen', short: 'CROSS' }
};

let pool = null;
let blacklistSystem = null;

function initialize(client, dbPool) {
  pool = dbPool;
  try {
    const { getBlacklistSystem } = require('./blacklistSystem');
    blacklistSystem = getBlacklistSystem(pool);
    blacklistSystem.initialize();
  } catch (e) {}
  
  client.on('interactionCreate', handleInteraction);
  console.log('[BOUNTY LFG] ✅ Initialized');
}

async function createSession(message, client) {
  const userId = message.author.id;
  if (activeSessions.has(userId)) {
    return message.reply({ content: '❌ You already have an active session.', ephemeral: true });
  }

  await message.delete().catch(() => {});

  const setupId = `bounty_${userId}_${Date.now()}`;
  setupSessions.set(setupId, {
    hostId: userId,
    hostUsername: message.author.username,
    channelId: message.channel.id,
    guildId: message.guild.id,
    step: 1,
    data: {}
  });

  try {
    await message.author.send({ 
      embeds: [createSetupEmbed(1, {})], 
      components: [createPlatformSelect(setupId)] 
    });
    const confirm = await message.channel.send({
      embeds: [new EmbedBuilder().setDescription(`📩 **${message.author.username}**, check your DMs!`).setColor(COLORS.badge)]
    });
    setTimeout(() => confirm.delete().catch(() => {}), 5000);
  } catch (e) {
    message.channel.send({ content: `❌ **${message.author.username}**, enable DMs!` });
  }
}

function createSetupEmbed(step, data) {
  const progress = '▰'.repeat(step) + '▱'.repeat(5 - step);
  const embed = new EmbedBuilder().setTitle('```💀 BOUNTY HUNTER SETUP```').setColor(COLORS.wanted).setFooter({ text: `Step ${step}/5` });
  
  if (step === 1) embed.setDescription(`\`${progress}\`\n\n**SELECT PLATFORM**`);
  else if (step === 3) embed.setDescription(`\`${progress}\`\n\n**SELECT BOUNTY TYPE**\n\n${Object.entries(BOUNTY_TYPES).map(([k, v]) => `${v.emoji} **${v.name}**`).join('\n')}`);
  else if (step === 4) embed.setDescription(`\`${progress}\`\n\n**SELECT TARGET**`);
  else if (step === 5) {
    embed.setDescription(`\`${progress}\`\n\n**FINAL OPTIONS**`);
    embed.addFields({ name: 'Summary', value: formatSummary(data) });
  }
  return embed;
}

function formatSummary(data) {
  const lines = [];
  if (data.platform) lines.push(`**Platform:** ${PLATFORMS[data.platform]?.name}`);
  if (data.psn) lines.push(`**PSN:** ${data.psn}`);
  if (data.bountyType) lines.push(`**Type:** ${BOUNTY_TYPES[data.bountyType]?.name}`);
  if (data.target) lines.push(`**Target:** ${LEGENDARY_TARGETS[data.target]?.name}`);
  if (data.strategy) lines.push(`**Strategy:** ${STRATEGIES[data.strategy]?.name}`);
  return lines.join('\n') || 'No selections';
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
      .addOptions(Object.entries(BOUNTY_TYPES).map(([k, v]) => ({ label: v.name, value: k, emoji: v.emoji })))
  );
}

function createTargetSelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bounty_target_${setupId}`).setPlaceholder('🎯 Target')
      .addOptions(Object.entries(LEGENDARY_TARGETS).map(([k, v]) => ({ label: v.name, description: `${v.difficulty} • $${v.cash}`, value: k, emoji: v.emoji })))
  );
}

function createStrategySelect(setupId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bounty_strategy_${setupId}`).setPlaceholder('⏱️ Strategy')
      .addOptions(Object.entries(STRATEGIES).map(([k, v]) => ({ label: v.name, description: v.description, value: k, emoji: v.emoji })))
  );
}

function createFinalOptions(setupId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bounty_voice_yes_${setupId}`).setLabel('🔊 Voice').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bounty_voice_no_${setupId}`).setLabel('🔇 No Voice').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bounty_start_${setupId}`).setLabel('START RECRUITING').setStyle(ButtonStyle.Success).setEmoji('🚀')
    )
  ];
}

function createMainSessionEmbed(session) {
  const bountyType = BOUNTY_TYPES[session.bountyType];
  const target = session.target ? LEGENDARY_TARGETS[session.target] : null;
  const strategy = STRATEGIES[session.strategy];
  const platform = PLATFORMS[session.platform];
  
  const crewList = session.crew.length > 0 
    ? session.crew.map((c, i) => `\`${i + 1}\` <@${c.userId}> • \`${c.psn}\``).join('\n')
    : '```\nWaiting for hunters...\n```';
  
  let payoutDisplay = '$100-200 + 0.24 gold';
  if (target && session.strategy === 'timer') payoutDisplay = `$${target.cash} + ${target.gold} gold (MAX)`;
  
  return new EmbedBuilder()
    .setAuthor({ name: '☠️ WANTED ☠️' })
    .setTitle(target ? `${target.emoji} ${target.name.toUpperCase()}` : `${bountyType.emoji} ${bountyType.name.toUpperCase()}`)
    .setDescription(`\`\`\`ansi\n[2;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━[0m\n\`\`\`\n${target ? `**Difficulty:** ${target.difficulty}` : ''}\n${strategy ? `**Strategy:** ${strategy.emoji} ${strategy.name}` : ''}`)
    .addFields(
      { name: '👤 HOST', value: `>>> <@${session.hostId}>\n\`${session.hostPsn}\``, inline: true },
      { name: '🎮 PLATFORM', value: `>>> ${platform?.short}`, inline: true },
      { name: '💰 PAYOUT', value: `>>> \`${payoutDisplay}\``, inline: true },
      { name: `🤠 POSSE ${session.crew.length + 1}/4`, value: `>>> ${crewList}`, inline: false }
    )
    .setColor(session.status === 'recruiting' ? COLORS.wanted : COLORS.success)
    .setFooter({ text: `⏱️ ${getTimeAgo(session.createdAt)} • DEAD OR ALIVE` })
    .setTimestamp();
}

function createSessionControls(session) {
  const rows = [];
  
  if (session.status === 'recruiting' && session.crew.length < 3) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bounty_join_${session.id}`).setLabel('JOIN HUNT').setStyle(ButtonStyle.Success).setEmoji('🎯')
    ));
  }
  
  const hostRow = new ActionRowBuilder();
  if (session.crew.length > 0) {
    hostRow.addComponents(new ButtonBuilder().setCustomId(`bounty_kick_menu_${session.id}`).setLabel('Kick').setStyle(ButtonStyle.Danger).setEmoji('👢'));
  }
  
  if (session.status === 'recruiting') {
    hostRow.addComponents(new ButtonBuilder().setCustomId(`bounty_ready_${session.id}`).setLabel('Ready').setStyle(ButtonStyle.Primary).setEmoji('✅'));
  } else if (session.status === 'ready') {
    hostRow.addComponents(new ButtonBuilder().setCustomId(`bounty_complete_${session.id}`).setLabel('COMPLETE').setStyle(ButtonStyle.Success).setEmoji('🏆'));
  }
  
  hostRow.addComponents(new ButtonBuilder().setCustomId(`bounty_cancel_${session.id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('❌'));
  rows.push(hostRow);
  
  return rows;
}

async function handleInteraction(interaction) {
  if (!interaction.customId?.startsWith('bounty_')) return;
  
  const parts = interaction.customId.split('_');
  const action = parts[1];
  const id = parts.slice(2).join('_');
  
  try {
    if (action === 'platform') await handlePlatform(interaction, id);
    else if (action === 'type') await handleType(interaction, id);
    else if (action === 'target') await handleTarget(interaction, id);
    else if (action === 'strategy') await handleStrategy(interaction, id);
    else if (action === 'voice') await handleVoice(interaction, id, parts[2] === 'yes');
    else if (action === 'start') await handleStart(interaction, id);
    else if (action === 'join') await handleJoin(interaction, id);
    else if (action === 'kick') await handleKick(interaction, id, parts[2]);
    else if (action === 'ready') await handleReady(interaction, id);
    else if (action === 'complete') await handleComplete(interaction, id);
    else if (action === 'cancel') await handleCancel(interaction, id);
  } catch (e) { console.error('[BOUNTY]', e); }
}

async function handlePlatform(interaction, setupId) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  session.data.platform = interaction.values[0];
  
  const modal = new ModalBuilder().setCustomId(`bounty_psn_${setupId}`).setTitle('Enter PSN');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('psn').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true)
  ));
  await interaction.showModal(modal);
  
  try {
    const modalInt = await interaction.awaitModalSubmit({ filter: i => i.customId === `bounty_psn_${setupId}`, time: 120000 });
    session.data.psn = modalInt.fields.getTextInputValue('psn');
    session.step = 3;
    await modalInt.update({ embeds: [createSetupEmbed(3, session.data)], components: [createBountyTypeSelect(setupId)] });
  } catch (e) {}
}

async function handleType(interaction, setupId) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  session.data.bountyType = interaction.values[0];
  session.step = 4;
  
  if (session.data.bountyType === 'legendary') {
    await interaction.update({ embeds: [createSetupEmbed(4, session.data)], components: [createTargetSelect(setupId)] });
  } else {
    await interaction.update({ embeds: [createSetupEmbed(4, session.data)], components: [createStrategySelect(setupId)] });
  }
}

async function handleTarget(interaction, setupId) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  session.data.target = interaction.values[0];
  await interaction.update({ embeds: [createSetupEmbed(4, session.data)], components: [createStrategySelect(setupId)] });
}

async function handleStrategy(interaction, setupId) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  session.data.strategy = interaction.values[0];
  session.step = 5;
  session.data.voice = false;
  await interaction.update({ embeds: [createSetupEmbed(5, session.data)], components: createFinalOptions(setupId) });
}

async function handleVoice(interaction, setupId, wantsVoice) {
  const session = setupSessions.get(setupId);
  if (!session) return;
  session.data.voice = wantsVoice;
  await interaction.update({ embeds: [createSetupEmbed(5, session.data)], components: createFinalOptions(setupId) });
}

async function handleStart(interaction, setupId) {
  const setup = setupSessions.get(setupId);
  if (!setup) return;
  
  const sessionId = `bounty_${Date.now()}_${setup.hostId.slice(-4)}`;
  
  let voiceChannel = null;
  if (setup.data.voice) {
    try {
      const guild = interaction.client.guilds.cache.get(setup.guildId);
      const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && 
        (c.name.toLowerCase().includes('red dead') || c.name.toLowerCase().includes('rdo') || c.name.toLowerCase().includes('rdr')));
      voiceChannel = await guild.channels.create({
        name: `💀 ${setup.hostUsername}'s Hunt`,
        type: ChannelType.GuildVoice,
        parent: category?.id,
        userLimit: 4
      });
    } catch (e) {}
  }
  
  const session = {
    id: sessionId, hostId: setup.hostId, hostUsername: setup.hostUsername, hostPsn: setup.data.psn,
    platform: setup.data.platform, bountyType: setup.data.bountyType, target: setup.data.target, strategy: setup.data.strategy,
    crew: [], status: 'recruiting', voiceChannelId: voiceChannel?.id, createdAt: Date.now(), channelId: setup.channelId, messageId: null
  };
  
  const lfgChannel = interaction.client.channels.cache.get(setup.channelId);
  const pingRole = lfgChannel.guild.roles.cache.find(r => r.name.toLowerCase().includes('bounty'));
  const lfgMessage = await lfgChannel.send({
    content: pingRole ? `<@&${pingRole.id}>` : '💀 **New Bounty Hunt!**',
    embeds: [createMainSessionEmbed(session)],
    components: createSessionControls(session)
  });
  
  session.messageId = lfgMessage.id;
  activeSessions.set(setup.hostId, session);
  activeSessions.set(sessionId, session);
  setupSessions.delete(setupId);
  
  await interaction.update({
    embeds: [new EmbedBuilder().setTitle('🚀 HUNT IS LIVE!').setDescription(`[Go to session](https://discord.com/channels/${setup.guildId}/${setup.channelId}/${lfgMessage.id})`).setColor(COLORS.success)],
    components: []
  });
}

async function handleJoin(interaction, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Session not found.', ephemeral: true });
  if (session.hostId === interaction.user.id || session.crew.some(c => c.userId === interaction.user.id)) return interaction.reply({ content: '❌ Already in.', ephemeral: true });
  if (session.crew.length >= 3) return interaction.reply({ content: '❌ Full.', ephemeral: true });
  if (blacklistSystem && await blacklistSystem.isBlacklisted(session.hostId, interaction.user.id)) return interaction.reply({ content: '🚫 Blacklisted.', ephemeral: true });
  
  const modal = new ModalBuilder().setCustomId(`bounty_join_psn_${sessionId}`).setTitle('Join Hunt');
  modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('psn').setLabel('PSN').setStyle(TextInputStyle.Short).setRequired(true)));
  await interaction.showModal(modal);
  
  try {
    const modalInt = await interaction.awaitModalSubmit({ filter: i => i.customId === `bounty_join_psn_${sessionId}`, time: 60000 });
    session.crew.push({ userId: modalInt.user.id, username: modalInt.user.username, psn: modalInt.fields.getTextInputValue('psn'), joinedAt: Date.now() });
    await updateSession(interaction.client, session);
    await modalInt.reply({ content: '✅ Joined!', ephemeral: true });
  } catch (e) {}
}

async function handleKick(interaction, sessionId, subAction) {
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  if (subAction === 'menu') {
    if (session.crew.length === 0) return interaction.reply({ content: '❌ No one to kick.', ephemeral: true });
    const select = new StringSelectMenuBuilder().setCustomId(`bounty_kick_select_${sessionId}`).setPlaceholder('Select player')
      .addOptions(session.crew.map(c => ({ label: c.username, value: c.userId })));
    await interaction.reply({ content: '👢 Select:', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    
    try {
      const selectInt = await interaction.channel.awaitMessageComponent({ filter: i => i.customId === `bounty_kick_select_${sessionId}`, time: 30000 });
      const kicked = session.crew.find(c => c.userId === selectInt.values[0]);
      session.crew = session.crew.filter(c => c.userId !== selectInt.values[0]);
      await updateSession(interaction.client, session);
      if (blacklistSystem) {
        const { embed, row } = blacklistSystem.createBlacklistPrompt(session.hostId, kicked.userId, kicked.username);
        await selectInt.update({ embeds: [embed], components: [row] });
      } else await selectInt.update({ content: `✅ Kicked ${kicked.username}`, components: [] });
    } catch (e) {}
  }
}

async function handleReady(interaction, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) return;
  session.status = 'ready';
  await updateSession(interaction.client, session);
  await interaction.reply({ content: '🚀 Hunt starting!', ephemeral: true });
}

async function handleComplete(interaction, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) return;
  
  if (session.voiceChannelId) {
    try { await interaction.client.channels.cache.get(session.voiceChannelId)?.delete('Completed'); } catch (e) {}
  }
  
  try {
    const channel = interaction.client.channels.cache.get(session.channelId);
    const msg = await channel.messages.fetch(session.messageId);
    const target = LEGENDARY_TARGETS[session.target];
    await msg.edit({
      embeds: [new EmbedBuilder().setTitle('🏆 BOUNTY COMPLETED').setDescription(`**${target?.name || 'Bounty'}** captured!\n\n**Host:** <@${session.hostId}>\n**Posse:** ${session.crew.map(c => `<@${c.userId}>`).join(', ') || 'Solo'}`).setColor(COLORS.success).setTimestamp()],
      components: []
    });
  } catch (e) {}
  
  activeSessions.delete(sessionId);
  activeSessions.delete(session.hostId);
  await interaction.reply({ content: '🏆 **Bounty completed!** Voice closed.', ephemeral: true });
}

async function handleCancel(interaction, sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || interaction.user.id !== session.hostId) return;
  
  if (session.voiceChannelId) try { await interaction.client.channels.cache.get(session.voiceChannelId)?.delete(); } catch (e) {}
  try {
    const channel = interaction.client.channels.cache.get(session.channelId);
    await (await channel.messages.fetch(session.messageId)).delete();
  } catch (e) {}
  
  activeSessions.delete(sessionId);
  activeSessions.delete(session.hostId);
  await interaction.reply({ content: '✅ Cancelled.', ephemeral: true });
}

async function updateSession(client, session) {
  try {
    const channel = client.channels.cache.get(session.channelId);
    const msg = await channel.messages.fetch(session.messageId);
    await msg.edit({ embeds: [createMainSessionEmbed(session)], components: createSessionControls(session) });
  } catch (e) {}
}

function getTimeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  return mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
}

module.exports = { initialize, createSession };
