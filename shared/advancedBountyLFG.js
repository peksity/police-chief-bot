/**
 * ADVANCED BOUNTY LFG v4
 * - EPHEMERAL SETUP (DM until recruiting)
 * - PSN required
 * - Role ping when recruiting
 */

const { 
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType
} = require('discord.js');

const BOUNTY_CONFIG = {
  bountyTypes: {
    'regular': { name: '⭐ Regular', payout: 25, gold: 0.24 },
    'legendary': { name: '🌟 Legendary', payout: 225, gold: 0.48 },
    'infamous': { name: '💀 Infamous', payout: 150, gold: 0.36 }
  },
  legendaryBounties: {
    'etta_doyle': { name: '👩 Etta Doyle', description: 'EASIEST - She comes to you' },
    'red_ben': { name: '🔴 Red Ben', description: 'Train heist' },
    'cecil_tucker': { name: '🎭 Cecil Tucker', description: 'Theater' },
    'owlhoot': { name: '🦉 Owlhoot', description: 'Multiple targets' }
  },
  strategies: {
    'speed': { name: '⚡ Speed', description: 'Fast, lower pay' },
    'timer': { name: '⏱️ Timer', description: '12 min wait = MAX PAY' }
  },
  maxPlayers: 4,
  sessionTimeout: 30 * 60 * 1000
};

const activeSessions = new Map();
const userCooldowns = new Map();
const kickedUsers = new Map();

function initialize(client) {
  console.log('[BOUNTY LFG] v4 initializing...');
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) await handleButton(interaction, client);
      if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction, client);
      if (interaction.isModalSubmit()) await handleModal(interaction, client);
    } catch (e) { console.error('[BOUNTY]', e); }
  });
  setInterval(() => checkTimeouts(client), 60000);
  console.log('[BOUNTY LFG] ✅ v4 ready');
}

async function createSession(message, client) {
  const userId = message.author.id;
  
  const cooldown = userCooldowns.get(userId);
  if (cooldown && Date.now() - cooldown < 3 * 60 * 1000) {
    const r = await message.reply({ content: `⏳ Wait before hosting.` });
    setTimeout(() => { message.delete().catch(() => {}); r.delete().catch(() => {}); }, 5000);
    return;
  }
  
  for (const [, s] of activeSessions) {
    if (s.userId === userId) {
      const r = await message.reply({ content: `❌ You have an active bounty!` });
      setTimeout(() => { message.delete().catch(() => {}); r.delete().catch(() => {}); }, 5000);
      return;
    }
  }
  
  await message.delete().catch(() => {});
  
  const member = await message.guild.members.fetch(userId);
  const platform = member.roles.cache.some(r => r.name.includes('PS5')) ? 'PS5' : member.roles.cache.some(r => r.name.includes('PS4')) ? 'PS4' : 'Unknown';
  
  const sessionId = `bounty_${Date.now()}_${userId}`;
  const session = {
    id: sessionId,
    userId,
    username: message.author.username,
    psnUsername: null,
    platform,
    players: [],
    bountyType: 'legendary',
    legendaryTarget: null,
    strategy: 'timer',
    status: 'setup',
    voiceChannel: null,
    publicMessageId: null,
    channelId: message.channel.id,
    guildId: message.guild.id,
    createdAt: Date.now(),
    totalCash: 0,
    totalGold: 0,
    bountiesCompleted: 0
  };
  
  kickedUsers.set(sessionId, new Set());
  activeSessions.set(sessionId, session);
  
  try {
    const embed = new EmbedBuilder()
      .setTitle('💀 BOUNTY HUNT - SETUP')
      .setDescription(`Setting up bounty for **#${message.channel.name}**\n\nClick below to enter PSN and configure.`)
      .setColor(0x8B0000)
      .setFooter({ text: '🔒 Only you see this until recruiting' });
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bounty_enterpsn_${sessionId}`).setLabel('Enter PSN').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
      new ButtonBuilder().setCustomId(`bounty_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    
    await message.author.send({ embeds: [embed], components: [row] });
    const confirm = await message.channel.send({ content: `<@${userId}> Check DMs to set up your bounty! 📩` });
    setTimeout(() => confirm.delete().catch(() => {}), 5000);
  } catch (e) {
    const embed = new EmbedBuilder().setTitle('💀 BOUNTY - Setup').setDescription('Click to start setup').setColor(0x8B0000);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bounty_enterpsn_${sessionId}`).setLabel('Enter PSN').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`bounty_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );
    const msg = await message.channel.send({ embeds: [embed], components: [row] });
    session.setupMessageId = msg.id;
    session.setupInChannel = true;
  }
  
  return session;
}

async function handleModal(interaction, client) {
  const customId = interaction.customId;
  
  if (customId.startsWith('bounty_modal_')) {
    const sessionId = customId.replace('bounty_modal_', '');
    const session = activeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
    
    const psn = interaction.fields.getTextInputValue('psn_input');
    session.psnUsername = psn;
    session.players.push({ userId: session.userId, username: session.username, psn });
    
    await interaction.update({ embeds: [createSetupEmbed(session)], components: createSetupComponents(sessionId, session) });
  }
  
  if (customId.startsWith('bounty_joinmodal_')) {
    const sessionId = customId.replace('bounty_joinmodal_', '');
    const session = activeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
    
    const psn = interaction.fields.getTextInputValue('psn_input');
    session.players.push({ userId: interaction.user.id, username: interaction.user.username, psn });
    
    const channel = await client.channels.fetch(session.channelId);
    const msg = await channel.messages.fetch(session.publicMessageId);
    await msg.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
    
    await interaction.reply({ content: '✅ Joined!', ephemeral: true });
    await channel.send({ content: `🤠 **${psn}** joined! (${session.players.length}/${BOUNTY_CONFIG.maxPlayers})` });
  }
}

async function handleButton(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('bounty_')) return;
  
  const parts = customId.split('_');
  const action = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  if (action === 'enterpsn') {
    const session = activeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
    if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
    
    const modal = new ModalBuilder().setCustomId(`bounty_modal_${sessionId}`).setTitle('Enter PSN');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('psn_input').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16)
    ));
    return interaction.showModal(modal);
  }
  
  const session = activeSessions.get(sessionId);
  
  switch (action) {
    case 'start':
      if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      if (session.bountyType === 'legendary' && !session.legendaryTarget) return interaction.reply({ content: '❌ Select target!', ephemeral: true });
      await handleStartRecruiting(interaction, session, sessionId, client);
      break;
      
    case 'cancel':
      if (session && interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      activeSessions.delete(sessionId);
      kickedUsers.delete(sessionId);
      await interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ Cancelled').setColor(0xFF0000)], components: [] });
      break;
      
    case 'join':
      if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
      await handleJoin(interaction, session, sessionId, client);
      break;
      
    case 'leave':
      if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
      if (interaction.user.id === session.userId) return interaction.reply({ content: '❌ Use End.', ephemeral: true });
      const idx = session.players.findIndex(p => p.userId === interaction.user.id);
      if (idx === -1) return interaction.reply({ content: '❌ Not in.', ephemeral: true });
      session.players.splice(idx, 1);
      const ch = await client.channels.fetch(session.channelId);
      const m = await ch.messages.fetch(session.publicMessageId);
      await m.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      await interaction.reply({ content: '👋 Left.', ephemeral: true });
      break;
      
    case 'voice':
      if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      if (session.voiceChannel) return interaction.reply({ content: `🔊 <#${session.voiceChannel}>`, ephemeral: true });
      const guild = await client.guilds.fetch(session.guildId);
      const cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('rdo'));
      const vc = await guild.channels.create({ name: `💀 ${session.psnUsername}`, type: ChannelType.GuildVoice, parent: cat?.id, userLimit: 4 });
      session.voiceChannel = vc.id;
      await interaction.reply({ content: `🔊 <#${vc.id}>` });
      break;
      
    case 'ready':
      if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      session.status = 'in_progress';
      const ch2 = await client.channels.fetch(session.channelId);
      const m2 = await ch2.messages.fetch(session.publicMessageId);
      await m2.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      await ch2.send({ content: `🚀 **HUNT STARTING!** ${session.players.map(p => `<@${p.userId}>`).join(' ')}` });
      await interaction.reply({ content: '✅ Started!', ephemeral: true });
      break;
      
    case 'complete':
      if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      const typeInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
      session.bountiesCompleted++;
      session.totalCash += typeInfo.payout;
      session.totalGold += typeInfo.gold;
      const ch3 = await client.channels.fetch(session.channelId);
      const m3 = await ch3.messages.fetch(session.publicMessageId);
      await m3.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      await ch3.send({ content: `💰 **BOUNTY #${session.bountiesCompleted}!** +$${typeInfo.payout} +${typeInfo.gold}g` });
      await interaction.reply({ content: '✅ Logged!', ephemeral: true });
      break;
      
    case 'end':
      if (!session || interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      await handleEnd(interaction, session, sessionId, client);
      break;
  }
}

async function handleSelectMenu(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('bounty_')) return;
  
  const parts = customId.split('_');
  const type = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
  
  const value = interaction.values[0];
  
  if (type === 'kick') {
    if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
    const idx = session.players.findIndex(p => p.userId === value);
    if (idx === -1) return;
    const kicked = session.players.splice(idx, 1)[0];
    kickedUsers.get(sessionId)?.add(value);
    try { const u = await client.users.fetch(value); await u.send({ embeds: [new EmbedBuilder().setTitle('❌ Removed from Bounty').setColor(0xFF0000)] }); } catch (e) {}
    const ch = await client.channels.fetch(session.channelId);
    const m = await ch.messages.fetch(session.publicMessageId);
    await m.edit({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
    await ch.send({ content: `👢 **${kicked.psn}** removed.` });
    await interaction.reply({ content: '✅ Kicked', ephemeral: true });
    return;
  }
  
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  if (type === 'type') {
    session.bountyType = value;
    if (value !== 'legendary') session.legendaryTarget = null;
  } else if (type === 'target') session.legendaryTarget = value;
  else if (type === 'strategy') session.strategy = value;
  
  await interaction.update({ embeds: [createSetupEmbed(session)], components: createSetupComponents(sessionId, session) });
}

async function handleStartRecruiting(interaction, session, sessionId, client) {
  session.status = 'recruiting';
  
  await interaction.update({ 
    embeds: [new EmbedBuilder().setTitle('✅ Posted!').setDescription('Check the LFG channel.').setColor(0x00FF00)],
    components: []
  });
  
  const channel = await client.channels.fetch(session.channelId);
  const guild = await client.guilds.fetch(session.guildId);
  const role = guild.roles.cache.find(r => r.name.toLowerCase().includes('bounty') || r.name.toLowerCase().includes('hunter'));
  
  const publicMsg = await channel.send({
    content: role ? `${role} **BOUNTY HUNT OPEN!**` : '💀 **BOUNTY HUNT OPEN!**',
    embeds: [createRecruitingEmbed(session)],
    components: createRecruitingComponents(sessionId, session)
  });
  
  session.publicMessageId = publicMsg.id;
  
  const targetName = session.legendaryTarget ? BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget].name : BOUNTY_CONFIG.bountyTypes[session.bountyType].name;
  await channel.send({ content: `💀 **${session.psnUsername}** (${session.platform}) | ${targetName} | Click Join!` });
}

async function handleJoin(interaction, session, sessionId, client) {
  if (kickedUsers.get(sessionId)?.has(interaction.user.id)) return interaction.reply({ content: '❌ Removed.', ephemeral: true });
  if (session.players.some(p => p.userId === interaction.user.id)) return interaction.reply({ content: '❌ Already in!', ephemeral: true });
  if (session.players.length >= BOUNTY_CONFIG.maxPlayers) return interaction.reply({ content: '❌ Full!', ephemeral: true });
  
  const modal = new ModalBuilder().setCustomId(`bounty_joinmodal_${sessionId}`).setTitle('Enter PSN');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('psn_input').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16)
  ));
  await interaction.showModal(modal);
}

async function handleEnd(interaction, session, sessionId, client) {
  userCooldowns.set(session.userId, Date.now());
  
  for (const p of session.players.filter(x => x.odIdActual !== session.userId)) {
    try { 
      const u = await client.users.fetch(p.userId); 
      await u.send({ embeds: [new EmbedBuilder().setTitle('💀 Hunt Ended').setDescription(`${session.psnUsername}'s bounty ended.\nTotal: $${session.totalCash} | ${session.totalGold}g`).setColor(0x00FF00)] }); 
    } catch (e) {}
  }
  
  const ch = await client.channels.fetch(session.channelId);
  if (session.players.length > 1) {
    await ch.send({ content: `💀 **HUNT ENDED** | ${session.players.filter(p => p.userId !== session.userId).map(p => `<@${p.userId}>`).join(' ')} | $${session.totalCash}` });
  }
  
  if (session.voiceChannel) { 
    try { const c = await client.channels.fetch(session.voiceChannel); if (c) await c.delete(); } catch (e) {} 
  }
  
  const m = await ch.messages.fetch(session.publicMessageId).catch(() => null);
  if (m) await m.edit({ 
    embeds: [new EmbedBuilder().setTitle('💀 Hunt Complete!').setDescription(`**Host:** ${session.psnUsername}\n**Total:** $${session.totalCash} | ${session.totalGold}g`).setColor(0x00FF00)], 
    components: [] 
  });
  
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  await interaction.reply({ content: '✅ Ended!', ephemeral: true });
}

function createSetupEmbed(session) {
  const typeInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const targetInfo = session.legendaryTarget ? BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget] : null;
  const stratInfo = BOUNTY_CONFIG.strategies[session.strategy];
  
  return new EmbedBuilder()
    .setTitle('💀 BOUNTY - SETUP')
    .setDescription(`**Host:** ${session.username}\n**PSN:** ${session.psnUsername}\n**Platform:** ${session.platform}`)
    .addFields(
      { name: '📋 Type', value: `✅ **${typeInfo.name}**`, inline: true },
      { name: '🎯 Target', value: targetInfo ? `✅ **${targetInfo.name}**` : (session.bountyType === 'legendary' ? '❓ Select target' : '🎲 Random'), inline: true },
      { name: '💰 Strategy', value: `✅ **${stratInfo.name}**\n${stratInfo.description}`, inline: true }
    )
    .setColor(0x8B0000)
    .setFooter({ text: '🔒 Only you see this until you start recruiting' });
}

function createRecruitingEmbed(session) {
  const typeInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const targetName = session.legendaryTarget ? BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget].name : typeInfo.name;
  
  let playerList = '';
  for (let i = 0; i < BOUNTY_CONFIG.maxPlayers; i++) {
    if (session.players[i]) {
      const p = session.players[i];
      playerList += `${i + 1}. ${p.userId === session.userId ? '⭐' : '🤠'} **${p.psn}** ${p.userId === session.userId ? '(Host)' : ''}\n`;
    } else {
      playerList += `${i + 1}. ⬜ *Open*\n`;
    }
  }
  
  return new EmbedBuilder()
    .setTitle('💀 BOUNTY HUNT - RECRUITING')
    .setDescription(`**Host:** ${session.psnUsername} (${session.platform})\n**${targetName}** | ${BOUNTY_CONFIG.strategies[session.strategy].name}`)
    .addFields(
      { name: '👥 Posse', value: playerList, inline: true },
      { name: '📊 Rewards', value: `Cash: **$${typeInfo.payout}**\nGold: **${typeInfo.gold}**`, inline: true }
    )
    .setColor(session.status === 'in_progress' ? 0x00FF00 : 0x8B0000)
    .setTimestamp();
}

function createSetupComponents(sessionId, session) {
  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId(`bounty_type_${sessionId}`)
    .setPlaceholder(`✅ ${BOUNTY_CONFIG.bountyTypes[session.bountyType].name}`)
    .addOptions(Object.entries(BOUNTY_CONFIG.bountyTypes).map(([k, v]) => ({ label: v.name, value: k, default: session.bountyType === k })));
  
  const stratSelect = new StringSelectMenuBuilder()
    .setCustomId(`bounty_strategy_${sessionId}`)
    .setPlaceholder(`✅ ${BOUNTY_CONFIG.strategies[session.strategy].name}`)
    .addOptions(Object.entries(BOUNTY_CONFIG.strategies).map(([k, v]) => ({ label: v.name, description: v.description, value: k, default: session.strategy === k })));
  
  const components = [new ActionRowBuilder().addComponents(typeSelect), new ActionRowBuilder().addComponents(stratSelect)];
  
  if (session.bountyType === 'legendary') {
    const targetSelect = new StringSelectMenuBuilder()
      .setCustomId(`bounty_target_${sessionId}`)
      .setPlaceholder(session.legendaryTarget ? `✅ ${BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget].name}` : '🎯 Select Target')
      .addOptions(Object.entries(BOUNTY_CONFIG.legendaryBounties).map(([k, v]) => ({ label: v.name, description: v.description, value: k, default: session.legendaryTarget === k })));
    components.splice(1, 0, new ActionRowBuilder().addComponents(targetSelect));
  }
  
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bounty_start_${sessionId}`).setLabel('Start Recruiting').setStyle(ButtonStyle.Primary).setEmoji('🚀'),
    new ButtonBuilder().setCustomId(`bounty_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
  ));
  
  return components;
}

function createRecruitingComponents(sessionId, session) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bounty_join_${sessionId}`).setLabel('Join').setStyle(ButtonStyle.Success).setEmoji('🤠'),
    new ButtonBuilder().setCustomId(`bounty_leave_${sessionId}`).setLabel('Leave').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
    new ButtonBuilder().setCustomId(`bounty_voice_${sessionId}`).setLabel('Voice').setStyle(ButtonStyle.Primary).setEmoji('🔊')
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bounty_ready_${sessionId}`).setLabel('Start Hunt').setStyle(ButtonStyle.Success).setEmoji('🚀'),
    new ButtonBuilder().setCustomId(`bounty_complete_${sessionId}`).setLabel('Complete').setStyle(ButtonStyle.Primary).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`bounty_end_${sessionId}`).setLabel('End').setStyle(ButtonStyle.Danger).setEmoji('🛑')
  );
  const components = [row1, row2];
  
  if (session.players.length > 1) {
    const opts = session.players.filter(p => p.userId !== session.userId).map(p => ({ label: `Kick ${p.psn}`, value: p.userId, emoji: '👢' }));
    if (opts.length) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bounty_kick_${sessionId}`).setPlaceholder('👢 Kick player').addOptions(opts)));
  }
  return components;
}

function checkTimeouts(client) {
  for (const [id, s] of activeSessions) {
    if (Date.now() - s.createdAt > BOUNTY_CONFIG.sessionTimeout) {
      if (s.voiceChannel) client.channels.fetch(s.voiceChannel).then(c => c?.delete()).catch(() => {});
      activeSessions.delete(id);
      kickedUsers.delete(id);
    }
  }
}

async function createTables() { console.log('[BOUNTY] In-memory sessions'); }
module.exports = { initialize, createSession, createTables };
