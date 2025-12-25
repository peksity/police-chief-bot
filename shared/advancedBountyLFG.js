/**
 * ADVANCED BOUNTY LFG SYSTEM v3
 * - PSN Username required
 * - 4 players max
 * - Kick + blacklist
 * - DM notifications
 */

const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');

const BOUNTY_CONFIG = {
  bountyTypes: {
    'regular': { name: '⭐ Regular', payout: 25, gold: 0.24, description: '$10-25 + 0.24 gold. Quick.' },
    'legendary': { name: '🌟 Legendary', payout: 225, gold: 0.48, description: '$100-225 + 0.48 gold. HIGH PAY!' },
    'infamous': { name: '💀 Infamous', payout: 150, gold: 0.36, description: '$50-150. Weekly target.' }
  },
  
  legendaryBounties: {
    'etta_doyle': { name: '👩 Etta Doyle', description: 'EASIEST! She comes to you.' },
    'red_ben': { name: '🔴 Red Ben', description: 'Train heist. High pay.' },
    'cecil_tucker': { name: '🎭 Cecil Tucker', description: 'Theater showdown.' },
    'philip_carlier': { name: '🐊 Philip Carlier', description: 'Swamp hunt.' },
    'owlhoot': { name: '🦉 Owlhoot Family', description: 'Multiple targets.' }
  },
  
  strategies: {
    'speed': { name: '⚡ Speed', description: 'Fast. Lower pay.' },
    'timer': { name: '⏱️ Timer', description: 'Wait 12 min. MAX PAY!' }
  },
  
  maxPlayers: 4,
  minPlayers: 1,
  sessionTimeout: 30 * 60 * 1000
};

const activeSessions = new Map();
const userCooldowns = new Map();
const kickedUsers = new Map();

function initialize(client) {
  console.log('[BOUNTY LFG] Initializing v3...');
  
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) await handleButton(interaction, client);
      if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction, client);
      if (interaction.isModalSubmit()) await handleModal(interaction, client);
    } catch (e) {
      console.error('[BOUNTY LFG] Error:', e);
    }
  });
  
  setInterval(() => checkTimeouts(client), 60000);
  console.log('[BOUNTY LFG] ✅ v3 initialized');
}

async function createSession(message, client) {
  const userId = message.author.id;
  
  const cooldown = userCooldowns.get(userId);
  if (cooldown && Date.now() - cooldown < 3 * 60 * 1000) {
    return message.reply(`⏳ Wait before hosting another bounty.`);
  }
  
  for (const [, session] of activeSessions) {
    if (session.userId === userId) return message.reply(`❌ You have an active bounty!`);
  }
  
  const member = await message.guild.members.fetch(userId);
  const platform = member.roles.cache.some(r => r.name.includes('PS5')) ? 'PS5' 
    : member.roles.cache.some(r => r.name.includes('PS4')) ? 'PS4' : 'Unknown';
  
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
    messageId: null,
    channelId: message.channel.id,
    guildId: message.guild.id,
    createdAt: Date.now(),
    totalCash: 0,
    totalGold: 0,
    bountiesCompleted: 0
  };
  
  kickedUsers.set(sessionId, new Set());
  activeSessions.set(sessionId, session);
  
  const embed = new EmbedBuilder()
    .setTitle('💀 BOUNTY HUNT - ENTER PSN')
    .setDescription(`**Host:** ${session.username}\n**Platform:** ${platform}`)
    .setColor(0x8B0000);
  
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bounty_enterpsn_${sessionId}`).setLabel('Enter PSN').setStyle(ButtonStyle.Primary).setEmoji('🎮'),
    new ButtonBuilder().setCustomId(`bounty_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );
  
  const msg = await message.channel.send({ embeds: [embed], components: [row] });
  session.messageId = msg.id;
  
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
    
    await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
    await interaction.channel.send({ content: `🤠 **${psn}** joined! (${session.players.length}/${BOUNTY_CONFIG.maxPlayers})` });
  }
}

function createSetupEmbed(session) {
  const typeInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const targetInfo = session.legendaryTarget ? BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget] : null;
  const stratInfo = BOUNTY_CONFIG.strategies[session.strategy];
  
  return new EmbedBuilder()
    .setTitle('💀 BOUNTY HUNT - SETUP')
    .setDescription(`**Host:** ${session.username}\n**PSN:** ${session.psnUsername}\n**Platform:** ${session.platform}`)
    .addFields(
      { name: '📋 Type', value: `✅ **${typeInfo.name}**\n${typeInfo.description}`, inline: false },
      { name: '🎯 Target', value: targetInfo ? `✅ **${targetInfo.name}**\n${targetInfo.description}` : session.bountyType === 'legendary' ? '❓ **Select target**' : '🎲 Random', inline: false },
      { name: '💰 Strategy', value: `✅ **${stratInfo.name}**\n${stratInfo.description}`, inline: false }
    )
    .setColor(0x8B0000)
    .setTimestamp();
}

function createRecruitingEmbed(session) {
  const typeInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const targetInfo = session.legendaryTarget ? BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget] : null;
  
  let playerList = '';
  for (let i = 0; i < BOUNTY_CONFIG.maxPlayers; i++) {
    if (session.players[i]) {
      const p = session.players[i];
      playerList += `${i + 1}. ${p.userId === session.userId ? '⭐' : '🤠'} **${p.psn}**\n`;
    } else {
      playerList += `${i + 1}. ⬜ *Open*\n`;
    }
  }
  
  return new EmbedBuilder()
    .setTitle('💀 BOUNTY HUNT - RECRUITING')
    .setDescription(`**Host:** ${session.psnUsername} (${session.platform})\n\n${targetInfo ? targetInfo.name : typeInfo.name}`)
    .addFields(
      { name: '👥 Posse', value: playerList, inline: true },
      { name: '📊 Info', value: `Slots: **${session.players.length}/${BOUNTY_CONFIG.maxPlayers}**\nPay: **$${typeInfo.payout}**\nGold: **${typeInfo.gold}**`, inline: true }
    )
    .setColor(session.status === 'in_progress' ? 0x00FF00 : 0x8B0000)
    .setTimestamp();
}

function createSetupComponents(sessionId, session) {
  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId(`bounty_type_${sessionId}`)
    .setPlaceholder(`✅ ${BOUNTY_CONFIG.bountyTypes[session.bountyType].name}`)
    .addOptions(Object.entries(BOUNTY_CONFIG.bountyTypes).map(([k, v]) => ({
      label: v.name.replace(/[^\w\s]/g, '').trim(), description: v.description.slice(0, 50), value: k, default: session.bountyType === k
    })));
  
  const stratSelect = new StringSelectMenuBuilder()
    .setCustomId(`bounty_strategy_${sessionId}`)
    .setPlaceholder(`✅ ${BOUNTY_CONFIG.strategies[session.strategy].name}`)
    .addOptions(Object.entries(BOUNTY_CONFIG.strategies).map(([k, v]) => ({
      label: v.name.replace(/[^\w\s]/g, '').trim(), description: v.description, value: k, default: session.strategy === k
    })));
  
  const components = [
    new ActionRowBuilder().addComponents(typeSelect),
    new ActionRowBuilder().addComponents(stratSelect)
  ];
  
  if (session.bountyType === 'legendary') {
    const targetSelect = new StringSelectMenuBuilder()
      .setCustomId(`bounty_target_${sessionId}`)
      .setPlaceholder(session.legendaryTarget ? `✅ ${BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget].name}` : '🎯 Select Target')
      .addOptions(Object.entries(BOUNTY_CONFIG.legendaryBounties).map(([k, v]) => ({
        label: v.name.replace(/[^\w\s]/g, '').trim(), description: v.description.slice(0, 50), value: k, default: session.legendaryTarget === k
      })));
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
    new ButtonBuilder().setCustomId(`bounty_join_${sessionId}`).setLabel('Join Hunt').setStyle(ButtonStyle.Success).setEmoji('🤠'),
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
    const kickOptions = session.players.filter(p => p.userId !== session.userId).map(p => ({
      label: `Kick ${p.psn}`, value: p.userId, emoji: '👢'
    }));
    if (kickOptions.length > 0) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`bounty_kick_${sessionId}`).setPlaceholder('👢 Kick').addOptions(kickOptions)
      ));
    }
  }
  
  return components;
}

async function handleButton(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('bounty_')) return;
  
  const parts = customId.split('_');
  const action = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  if (action === 'enterpsn') {
    const modal = new ModalBuilder().setCustomId(`bounty_modal_${sessionId}`).setTitle('Enter PSN');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('psn_input').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true)
    ));
    return interaction.showModal(modal);
  }
  
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
  
  switch (action) {
    case 'start':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      if (session.bountyType === 'legendary' && !session.legendaryTarget) return interaction.reply({ content: '❌ Select target!', ephemeral: true });
      session.status = 'recruiting';
      await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      await interaction.channel.send({ content: `💀 **BOUNTY HUNT OPEN!** ${session.platform} | Click Join!` });
      break;
    case 'join':
      if (kickedUsers.get(sessionId)?.has(interaction.user.id)) return interaction.reply({ content: '❌ Removed.', ephemeral: true });
      if (session.players.some(p => p.userId === interaction.user.id)) return interaction.reply({ content: '❌ Already in!', ephemeral: true });
      if (session.players.length >= BOUNTY_CONFIG.maxPlayers) return interaction.reply({ content: '❌ Full!', ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`bounty_joinmodal_${sessionId}`).setTitle('Enter PSN');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('psn_input').setLabel('PSN').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      await interaction.showModal(modal);
      break;
    case 'leave':
      if (interaction.user.id === session.userId) return interaction.reply({ content: '❌ Use End.', ephemeral: true });
      const idx = session.players.findIndex(p => p.userId === interaction.user.id);
      if (idx === -1) return interaction.reply({ content: '❌ Not in.', ephemeral: true });
      session.players.splice(idx, 1);
      await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      break;
    case 'voice':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      if (session.voiceChannel) return interaction.reply({ content: `🔊 <#${session.voiceChannel}>`, ephemeral: true });
      const cat = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('rdo'));
      const vc = await interaction.guild.channels.create({ name: `💀 Bounty - ${session.psnUsername}`, type: ChannelType.GuildVoice, parent: cat?.id, userLimit: 4 });
      session.voiceChannel = vc.id;
      await interaction.reply({ content: `🔊 <#${vc.id}>` });
      break;
    case 'ready':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      session.status = 'in_progress';
      await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      await interaction.channel.send({ content: `🚀 **HUNT STARTING!** ${session.players.map(p => `<@${p.userId}>`).join(' ')}` });
      break;
    case 'complete':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      const typeInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
      session.bountiesCompleted++;
      session.totalCash += typeInfo.payout;
      session.totalGold += typeInfo.gold;
      await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      await interaction.channel.send({ content: `💰 **BOUNTY #${session.bountiesCompleted}!** +$${typeInfo.payout} +${typeInfo.gold} gold` });
      break;
    case 'cancel':
    case 'end':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      for (const p of session.players.filter(x => x.userId !== session.userId)) {
        try { const u = await client.users.fetch(p.userId); await u.send({ embeds: [new EmbedBuilder().setTitle(action === 'cancel' ? '❌ Cancelled' : '💀 Ended').setDescription(`${session.psnUsername}'s hunt ${action === 'cancel' ? 'cancelled' : 'ended'}. Total: $${session.totalCash}`).setColor(action === 'cancel' ? 0xFF0000 : 0x00FF00)] }); } catch (e) {}
      }
      if (session.players.length > 1) {
        await interaction.channel.send({ content: `${action === 'cancel' ? '❌ **CANCELLED**' : '💀 **ENDED**'} | ${session.players.filter(p => p.userId !== session.userId).map(p => `<@${p.userId}>`).join(' ')}` });
      }
      if (session.voiceChannel) { try { const ch = await client.channels.fetch(session.voiceChannel); if (ch) await ch.delete(); } catch (e) {} }
      activeSessions.delete(sessionId);
      kickedUsers.delete(sessionId);
      if (action === 'end') userCooldowns.set(session.userId, Date.now());
      await interaction.update({ embeds: [new EmbedBuilder().setTitle(action === 'cancel' ? '❌ Cancelled' : '💀 Complete!').setDescription(`$${session.totalCash} | ${session.totalGold} gold`).setColor(action === 'cancel' ? 0xFF0000 : 0x00FF00)], components: [] });
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
  
  if (type === 'kick') {
    if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
    const kickId = interaction.values[0];
    const idx = session.players.findIndex(p => p.userId === kickId);
    if (idx === -1) return;
    const kicked = session.players.splice(idx, 1)[0];
    kickedUsers.get(sessionId)?.add(kickId);
    try { const u = await client.users.fetch(kickId); await u.send({ embeds: [new EmbedBuilder().setTitle('❌ Removed').setDescription(`Removed from ${session.psnUsername}'s hunt.`).setColor(0xFF0000)] }); } catch (e) {}
    await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
    await interaction.channel.send({ content: `👢 **${kicked.psn}** removed.` });
    return;
  }
  
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  const value = interaction.values[0];
  if (type === 'type') {
    session.bountyType = value;
    if (value !== 'legendary') session.legendaryTarget = null;
  } else if (type === 'target') session.legendaryTarget = value;
  else if (type === 'strategy') session.strategy = value;
  
  await interaction.update({ embeds: [createSetupEmbed(session)], components: createSetupComponents(sessionId, session) });
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

async function createTables() { console.log('[BOUNTY] In-memory'); }

module.exports = { initialize, createSession, createTables };
