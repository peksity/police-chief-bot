/**
 * ██████╗  ██████╗ ██╗   ██╗███╗   ██╗████████╗██╗   ██╗    ██╗     ███████╗ ██████╗ 
 * ██╔══██╗██╔═══██╗██║   ██║████╗  ██║╚══██╔══╝╚██╗ ██╔╝    ██║     ██╔════╝██╔════╝ 
 * ██████╔╝██║   ██║██║   ██║██╔██╗ ██║   ██║    ╚████╔╝     ██║     █████╗  ██║  ███╗
 * ██╔══██╗██║   ██║██║   ██║██║╚██╗██║   ██║     ╚██╔╝      ██║     ██╔══╝  ██║   ██║
 * ██████╔╝╚██████╔╝╚██████╔╝██║ ╚████║   ██║      ██║       ███████╗██║     ╚██████╔╝
 * ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝   ╚═╝      ╚═╝       ╚══════╝╚═╝      ╚═════╝ 
 * 
 * ADVANCED BOUNTY HUNTER LFG SYSTEM v2
 * - Up to 4 players (1 leader + 3 posse)
 * - Host can kick players
 * - Blacklist per session
 * - DM notifications
 * - Detailed descriptions
 */

const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');

// ============================================
// BOUNTY CONFIGURATION
// ============================================

const BOUNTY_CONFIG = {
  // Bounty types with descriptions
  bountyTypes: {
    'regular': { 
      name: '⭐ Regular Bounty', 
      payout: { min: 10, max: 25 }, 
      gold: 0.24,
      description: 'Standard bounty poster. Quick & easy. Good for grinding.'
    },
    'legendary': { 
      name: '🌟 Legendary Bounty', 
      payout: { min: 100, max: 225 }, 
      gold: 0.48,
      description: 'HIGH PAYOUT! 5-star difficulty. Best with a posse.'
    },
    'infamous': { 
      name: '💀 Infamous Bounty', 
      payout: { min: 50, max: 150 }, 
      gold: 0.36,
      description: 'Weekly rotating target. Medium difficulty.'
    }
  },
  
  // Legendary bounties with detailed info
  legendaryBounties: {
    'etta_doyle': { 
      name: '👩 Etta Doyle', 
      difficulty: 5, 
      description: 'EASIEST! Let her escape, wait by the wagon. She comes to you.'
    },
    'red_ben': { 
      name: '🔴 Red Ben Clempson', 
      difficulty: 5, 
      description: 'Train heist. Multiple waves. High payout potential.'
    },
    'cecil_tucker': { 
      name: '🎭 Cecil C. Tucker', 
      difficulty: 3, 
      description: 'Theater showdown in Saint Denis. Stealth optional.'
    },
    'tobin_winfield': { 
      name: '🏛️ Tobin Winfield', 
      difficulty: 4, 
      description: 'Ex-senator in a fortified manor. Lots of guards.'
    },
    'philip_carlier': { 
      name: '🐊 Philip Carlier', 
      difficulty: 4, 
      description: 'Swamp hunt in Lagras. Watch for gators!'
    },
    'owlhoot': { 
      name: '🦉 Owlhoot Family', 
      difficulty: 5, 
      description: 'Capture the whole family. Multiple targets.'
    },
    'yukon_nik': { 
      name: '❄️ Yukon Nik', 
      difficulty: 4, 
      description: 'Snow area. Cold-blooded killer. Dress warm.'
    },
    'gene_beau': { 
      name: '🎪 Gene "Beau" Finley', 
      difficulty: 3, 
      description: 'Carnival con-man. Fun and easy hunt.'
    },
    'carmela': { 
      name: '🔥 Carmela "La Muñeca"', 
      difficulty: 4, 
      description: 'Ruthless bandit leader. Bring firepower.'
    },
    'sergio_vincenza': { 
      name: '🎨 Sergio Vincenza', 
      difficulty: 3, 
      description: 'Artist turned outlaw. Relatively easy.'
    }
  },
  
  // Payout strategy with descriptions
  payoutStrategy: {
    'speed': { 
      name: '⚡ Speed Run', 
      description: 'Complete ASAP. Lower payout but fast XP/Gold grind.'
    },
    'timer': { 
      name: '⏱️ Timer Method', 
      description: 'Wait until 30 seconds left. MAX PAYOUT! $225+ possible.'
    }
  },
  
  // Session settings - 4 PLAYERS MAX
  minPlayers: 1,
  maxPlayers: 4,
  sessionTimeout: 30 * 60 * 1000,
  voiceChannelTimeout: 10 * 60 * 1000
};

// Active sessions storage
const activeSessions = new Map();
const userCooldowns = new Map();
const kickedUsers = new Map();

// ============================================
// INITIALIZE LFG SYSTEM
// ============================================

function initialize(client) {
  console.log('[BOUNTY LFG] Initializing advanced Bounty LFG system v2...');
  
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
      await handleButton(interaction, client);
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, client);
    }
  });
  
  setInterval(() => checkSessionTimeouts(client), 60000);
  
  console.log('[BOUNTY LFG] ✅ Advanced Bounty LFG v2 initialized');
}

// ============================================
// CREATE NEW SESSION
// ============================================

async function createSession(message, client) {
  const userId = message.author.id;
  const guild = message.guild;
  
  // Check cooldown
  const cooldown = userCooldowns.get(userId);
  if (cooldown && Date.now() - cooldown < 3 * 60 * 1000) {
    const remaining = Math.ceil((3 * 60 * 1000 - (Date.now() - cooldown)) / 1000);
    return message.reply(`⏳ Hold it, hunter. Wait ${remaining} seconds before posting another bounty.`);
  }
  
  // Check existing session
  for (const [sessionId, session] of activeSessions) {
    if (session.host === userId) {
      return message.reply(`❌ You already have an active bounty! Use Cancel or wait for it to expire.`);
    }
  }
  
  // Get platform
  const member = await guild.members.fetch(userId);
  const isPS5 = member.roles.cache.some(r => r.name.includes('PS5') || r.name.includes('Primary: PS5'));
  const isPS4 = member.roles.cache.some(r => r.name.includes('PS4') || r.name.includes('Primary: PS4'));
  const platform = isPS5 ? 'PS5' : isPS4 ? 'PS4' : 'Unknown';
  
  const sessionId = `bounty_${Date.now()}_${userId}`;
  
  const session = {
    id: sessionId,
    host: userId,
    hostName: message.author.username,
    platform: platform,
    players: [{ userId: userId, name: message.author.username }],
    bountyType: 'legendary',
    legendaryTarget: null,
    payoutStrategy: 'timer',
    status: 'setup',
    voiceChannel: null,
    messageId: null,
    channelId: message.channel.id,
    createdAt: Date.now(),
    startedAt: null,
    totalCash: 0,
    totalGold: 0,
    bountiesCompleted: 0
  };
  
  kickedUsers.set(sessionId, new Set());
  
  const setupEmbed = createSetupEmbed(session);
  const setupComponents = createSetupComponents(sessionId, session);
  
  const msg = await message.channel.send({ 
    embeds: [setupEmbed], 
    components: setupComponents 
  });
  
  session.messageId = msg.id;
  activeSessions.set(sessionId, session);
  
  return session;
}

// ============================================
// SETUP EMBED
// ============================================

function createSetupEmbed(session) {
  const bountyInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const legendaryInfo = session.legendaryTarget ? BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget] : null;
  const strategyInfo = BOUNTY_CONFIG.payoutStrategy[session.payoutStrategy];
  
  const embed = new EmbedBuilder()
    .setTitle('💀 BOUNTY HUNT - SETUP')
    .setDescription(
      `**Host:** ${session.hostName}\n` +
      `**Platform:** ${session.platform}\n\n` +
      `*Configure your bounty hunt below*`
    )
    .addFields(
      { 
        name: '📋 Bounty Type', 
        value: `${bountyInfo.name}\n*${bountyInfo.description}*`, 
        inline: false 
      },
      { 
        name: '🎯 Target', 
        value: legendaryInfo 
          ? `${legendaryInfo.name} (⭐${legendaryInfo.difficulty})\n*${legendaryInfo.description}*` 
          : session.bountyType === 'legendary' ? '❓ Select a legendary target' : '🎲 Random from posters',
        inline: false 
      },
      { 
        name: '💰 Payout Strategy', 
        value: `${strategyInfo.name}\n*${strategyInfo.description}*`, 
        inline: false 
      }
    )
    .setColor(0x8B0000)
    .setFooter({ text: 'Select your options, then click "Start Recruiting"' })
    .setTimestamp();
  
  return embed;
}

// ============================================
// RECRUITING EMBED
// ============================================

function createRecruitingEmbed(session) {
  const bountyInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const legendaryInfo = session.legendaryTarget ? BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget] : null;
  const strategyInfo = BOUNTY_CONFIG.payoutStrategy[session.payoutStrategy];
  
  // Build player list
  let playerList = '';
  for (let i = 0; i < BOUNTY_CONFIG.maxPlayers; i++) {
    if (session.players[i]) {
      const player = session.players[i];
      const isHost = player.userId === session.host;
      playerList += `${i + 1}. ${isHost ? '⭐' : '🤠'} **${player.name}** ${isHost ? '(Leader)' : ''}\n`;
    } else {
      playerList += `${i + 1}. ⬜ *Open Slot*\n`;
    }
  }
  
  const targetDisplay = legendaryInfo 
    ? `${legendaryInfo.name}` 
    : bountyInfo.name;
  
  const embed = new EmbedBuilder()
    .setTitle('💀 BOUNTY HUNT - RECRUITING')
    .setDescription(
      `**Host:** ${session.hostName} | **Platform:** ${session.platform}\n\n` +
      `${targetDisplay} • ${strategyInfo.name}`
    )
    .addFields(
      { name: '👥 Posse', value: playerList, inline: true },
      { name: '📊 Info', value: 
        `Slots: ${session.players.length}/${BOUNTY_CONFIG.maxPlayers}\n` +
        `Cash: $${bountyInfo.payout.min}-${bountyInfo.payout.max}\n` +
        `Gold: ${bountyInfo.gold} per run\n` +
        `Status: ${session.status === 'in_progress' ? '🟢 HUNTING' : '🟡 RECRUITING'}`,
        inline: true 
      }
    )
    .setColor(session.status === 'in_progress' ? 0x00FF00 : 0x8B0000)
    .setFooter({ text: `Session ID: ${session.id.slice(-8)} • Click Join to ride along!` })
    .setTimestamp();
  
  if (session.bountiesCompleted > 0) {
    embed.addFields({
      name: '💰 Earnings',
      value: `Bounties: ${session.bountiesCompleted} | Cash: $${session.totalCash} | Gold: ${session.totalGold.toFixed(2)}`,
      inline: false
    });
  }
  
  return embed;
}

// ============================================
// SETUP COMPONENTS
// ============================================

function createSetupComponents(sessionId, session) {
  // Bounty Type Dropdown
  const bountySelect = new StringSelectMenuBuilder()
    .setCustomId(`bounty_type_${sessionId}`)
    .setPlaceholder('📋 Select Bounty Type')
    .addOptions([
      { label: 'Regular Bounty', description: '$10-25 + 0.24 gold. Quick grind.', value: 'regular', emoji: '⭐' },
      { label: 'Legendary Bounty', description: '$100-225 + 0.48 gold. HIGH PAYOUT!', value: 'legendary', emoji: '🌟' },
      { label: 'Infamous Bounty', description: '$50-150 + 0.36 gold. Weekly target.', value: 'infamous', emoji: '💀' }
    ]);
  
  // Legendary Target Dropdown (only show if legendary selected)
  const legendarySelect = new StringSelectMenuBuilder()
    .setCustomId(`bounty_target_${sessionId}`)
    .setPlaceholder('🎯 Select Legendary Target')
    .addOptions([
      { label: 'Etta Doyle', description: 'EASIEST! She comes to you.', value: 'etta_doyle', emoji: '👩' },
      { label: 'Red Ben Clempson', description: 'Train heist. High payout.', value: 'red_ben', emoji: '🔴' },
      { label: 'Cecil C. Tucker', description: 'Theater showdown.', value: 'cecil_tucker', emoji: '🎭' },
      { label: 'Tobin Winfield', description: 'Fortified manor.', value: 'tobin_winfield', emoji: '🏛️' },
      { label: 'Philip Carlier', description: 'Swamp hunt.', value: 'philip_carlier', emoji: '🐊' },
      { label: 'Owlhoot Family', description: 'Multiple targets.', value: 'owlhoot', emoji: '🦉' },
      { label: 'Yukon Nik', description: 'Snow area killer.', value: 'yukon_nik', emoji: '❄️' },
      { label: 'Gene Beau Finley', description: 'Carnival con-man.', value: 'gene_beau', emoji: '🎪' },
      { label: 'Carmela La Muñeca', description: 'Bandit leader.', value: 'carmela', emoji: '🔥' },
      { label: 'Sergio Vincenza', description: 'Artist outlaw.', value: 'sergio_vincenza', emoji: '🎨' }
    ]);
  
  // Payout Strategy Dropdown
  const strategySelect = new StringSelectMenuBuilder()
    .setCustomId(`bounty_strategy_${sessionId}`)
    .setPlaceholder('💰 Select Payout Strategy')
    .addOptions([
      { label: 'Speed Run', description: 'Complete fast. Lower payout.', value: 'speed', emoji: '⚡' },
      { label: 'Timer Method', description: 'Wait for MAX payout! ($225+)', value: 'timer', emoji: '⏱️' }
    ]);
  
  // Buttons
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bounty_start_${sessionId}`)
      .setLabel('Start Recruiting')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(`bounty_cancel_${sessionId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
  
  const components = [
    new ActionRowBuilder().addComponents(bountySelect),
    new ActionRowBuilder().addComponents(strategySelect),
    buttons
  ];
  
  // Add legendary select if legendary type is selected
  if (session.bountyType === 'legendary') {
    components.splice(1, 0, new ActionRowBuilder().addComponents(legendarySelect));
  }
  
  return components;
}

// ============================================
// RECRUITING COMPONENTS
// ============================================

function createRecruitingComponents(sessionId, session) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bounty_join_${sessionId}`)
      .setLabel('Join Hunt')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🤠'),
    new ButtonBuilder()
      .setCustomId(`bounty_leave_${sessionId}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚪'),
    new ButtonBuilder()
      .setCustomId(`bounty_voice_${sessionId}`)
      .setLabel('Create Voice')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔊')
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bounty_ready_${sessionId}`)
      .setLabel('Start Hunt')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🚀'),
    new ButtonBuilder()
      .setCustomId(`bounty_complete_${sessionId}`)
      .setLabel('Complete')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`bounty_end_${sessionId}`)
      .setLabel('End Session')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🛑')
  );
  
  // Host-only: Kick player dropdown
  if (session.players.length > 1) {
    const kickOptions = session.players
      .filter(p => p.userId !== session.host)
      .map(p => ({
        label: `Kick ${p.name}`,
        value: p.userId,
        emoji: '👢'
      }));
    
    if (kickOptions.length > 0) {
      const kickSelect = new StringSelectMenuBuilder()
        .setCustomId(`bounty_kick_${sessionId}`)
        .setPlaceholder('👢 Kick a player (Leader only)')
        .addOptions(kickOptions);
      
      return [row1, row2, new ActionRowBuilder().addComponents(kickSelect)];
    }
  }
  
  return [row1, row2];
}

// ============================================
// BUTTON HANDLERS
// ============================================

async function handleButton(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('bounty_')) return;
  
  const parts = customId.split('_');
  const action = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired or not found.', ephemeral: true });
  }
  
  try {
    switch (action) {
      case 'start':
        await handleStartRecruiting(interaction, session, sessionId, client);
        break;
      case 'cancel':
        await handleCancelSession(interaction, session, sessionId, client);
        break;
      case 'join':
        await handleJoinSession(interaction, session, sessionId, client);
        break;
      case 'leave':
        await handleLeaveSession(interaction, session, sessionId, client);
        break;
      case 'voice':
        await handleCreateVoice(interaction, session, sessionId, client);
        break;
      case 'ready':
        await handleReadyUp(interaction, session, sessionId, client);
        break;
      case 'complete':
        await handleRunComplete(interaction, session, sessionId, client);
        break;
      case 'end':
        await handleEndSession(interaction, session, sessionId, client);
        break;
    }
  } catch (error) {
    console.error('[BOUNTY LFG] Button error:', error);
    interaction.reply({ content: '❌ Something went wrong.', ephemeral: true }).catch(() => {});
  }
}

// ============================================
// SELECT MENU HANDLERS
// ============================================

async function handleSelectMenu(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('bounty_')) return;
  
  const parts = customId.split('_');
  const type = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  if (!session) {
    return interaction.reply({ content: '❌ Session expired or not found.', ephemeral: true });
  }
  
  // Kick handler
  if (type === 'kick') {
    await handleKickPlayer(interaction, session, sessionId, client);
    return;
  }
  
  // Only host can change settings
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the leader can change settings.', ephemeral: true });
  }
  
  const value = interaction.values[0];
  
  if (type === 'type') {
    session.bountyType = value;
    if (value !== 'legendary') {
      session.legendaryTarget = null;
    }
  } else if (type === 'target') {
    session.legendaryTarget = value;
  } else if (type === 'strategy') {
    session.payoutStrategy = value;
  }
  
  const embed = createSetupEmbed(session);
  const components = createSetupComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
}

// ============================================
// ACTION HANDLERS
// ============================================

async function handleStartRecruiting(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the leader can start recruiting.', ephemeral: true });
  }
  
  if (session.bountyType === 'legendary' && !session.legendaryTarget) {
    return interaction.reply({ content: '❌ Please select a legendary target first!', ephemeral: true });
  }
  
  session.status = 'recruiting';
  session.startedAt = Date.now();
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  const bountyInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const targetInfo = session.legendaryTarget ? BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget] : null;
  
  await interaction.channel.send({
    content: `💀 **BOUNTY HUNT OPEN!** ${session.platform} | ${targetInfo ? targetInfo.name : bountyInfo.name} | Click Join below!`
  });
}

async function handleJoinSession(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  // Check if kicked
  const kicked = kickedUsers.get(sessionId);
  if (kicked && kicked.has(userId)) {
    return interaction.reply({ 
      content: '❌ You were removed from this hunt by the leader. Wait for the next `?bounty` command.', 
      ephemeral: true 
    });
  }
  
  // Check if already in session
  if (session.players.some(p => p.userId === userId)) {
    return interaction.reply({ content: '❌ You\'re already in this hunt!', ephemeral: true });
  }
  
  // Check if full
  if (session.players.length >= BOUNTY_CONFIG.maxPlayers) {
    return interaction.reply({ content: '❌ Hunt is full! (4 max)', ephemeral: true });
  }
  
  // Check for required role
  const member = interaction.member;
  const requiredRoles = ['Bounty Hunter', 'Frontier Outlaw', '🐴 Frontier Outlaw', '💀 Bounty Hunter'];
  const hasRole = member.roles.cache.some(r => requiredRoles.some(req => r.name.includes(req)));
  
  if (!hasRole) {
    try {
      const rolesChannel = interaction.guild.channels.cache.find(c => c.name === 'roles' || c.name === 'get-roles');
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('💀 Bounty LFG - Role Required')
            .setDescription(
              `Hold it, hunter! You need the **Bounty Hunter** or **Frontier Outlaw** role to join hunts.\n\n` +
              `${rolesChannel ? `Head to <#${rolesChannel.id}> to get your roles!` : 'Check the roles channel in the server.'}`
            )
            .setColor(0xFF6B6B)
        ]
      });
    } catch (e) {}
    
    return interaction.reply({ 
      content: '❌ You need the **Bounty Hunter** or **Frontier Outlaw** role! Check your DMs.', 
      ephemeral: true 
    });
  }
  
  session.players.push({ userId: userId, name: interaction.user.username });
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `🤠 **${interaction.user.username}** joined the hunt! (${session.players.length}/${BOUNTY_CONFIG.maxPlayers})`
  });
}

async function handleLeaveSession(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  if (userId === session.host) {
    return interaction.reply({ content: '❌ As leader, use "End Session" to close the hunt.', ephemeral: true });
  }
  
  const playerIndex = session.players.findIndex(p => p.userId === userId);
  if (playerIndex === -1) {
    return interaction.reply({ content: '❌ You\'re not in this hunt.', ephemeral: true });
  }
  
  session.players.splice(playerIndex, 1);
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
}

async function handleKickPlayer(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the leader can kick players.', ephemeral: true });
  }
  
  const kickUserId = interaction.values[0];
  
  const playerIndex = session.players.findIndex(p => p.userId === kickUserId);
  if (playerIndex === -1) {
    return interaction.reply({ content: '❌ Player not found.', ephemeral: true });
  }
  
  const kickedPlayer = session.players[playerIndex];
  session.players.splice(playerIndex, 1);
  
  const kicked = kickedUsers.get(sessionId);
  if (kicked) kicked.add(kickUserId);
  
  try {
    const kickedMember = await interaction.guild.members.fetch(kickUserId);
    await kickedMember.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('💀 Removed from Bounty Hunt')
          .setDescription(
            `You were removed from **${session.hostName}**'s bounty hunt.\n\n` +
            `Wait for the next \`?bounty\` command to join a new one.`
          )
          .setColor(0xFF6B6B)
      ]
    });
  } catch (e) {}
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `👢 **${kickedPlayer.name}** was removed from the hunt by the leader.`
  });
}

async function handleCreateVoice(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the leader can create voice channels.', ephemeral: true });
  }
  
  if (session.voiceChannel) {
    return interaction.reply({ content: `🔊 Voice already exists: <#${session.voiceChannel}>`, ephemeral: true });
  }
  
  try {
    const category = interaction.guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('rdo') || c.name.toLowerCase().includes('red dead'))
    );
    
    const voiceChannel = await interaction.guild.channels.create({
      name: `💀 Bounty - ${session.hostName}`,
      type: ChannelType.GuildVoice,
      parent: category?.id,
      userLimit: BOUNTY_CONFIG.maxPlayers
    });
    
    session.voiceChannel = voiceChannel.id;
    
    const embed = createRecruitingEmbed(session);
    const components = createRecruitingComponents(sessionId, session);
    
    await interaction.update({ embeds: [embed], components });
    
    await interaction.channel.send({ content: `🔊 Voice channel created! <#${voiceChannel.id}>` });
  } catch (error) {
    console.error('[BOUNTY LFG] Voice error:', error);
    await interaction.reply({ content: '❌ Failed to create voice channel.', ephemeral: true });
  }
}

async function handleReadyUp(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the leader can start.', ephemeral: true });
  }
  
  session.status = 'in_progress';
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  const mentions = session.players.map(p => `<@${p.userId}>`).join(' ');
  await interaction.channel.send({
    content: `🚀 **HUNT STARTING!** ${mentions}\n\nBring 'em in dead or alive! 💀`
  });
}

async function handleRunComplete(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the leader can mark complete.', ephemeral: true });
  }
  
  const bountyInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const cash = session.payoutStrategy === 'timer' ? bountyInfo.payout.max : bountyInfo.payout.min;
  const gold = bountyInfo.gold;
  
  session.bountiesCompleted++;
  session.totalCash += cash;
  session.totalGold += gold;
  
  const embed = createRecruitingEmbed(session);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `💰 **BOUNTY #${session.bountiesCompleted} COMPLETE!** +$${cash} +${gold} gold | Total: $${session.totalCash} + ${session.totalGold.toFixed(2)} gold`
  });
}

async function handleCancelSession(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the leader can cancel.', ephemeral: true });
  }
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setTitle('❌ Bounty Hunt Cancelled')
        .setDescription(`**${session.hostName}** cancelled the hunt.`)
        .setColor(0xFF0000)
    ],
    components: []
  });
}

async function handleEndSession(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the leader can end.', ephemeral: true });
  }
  
  userCooldowns.set(session.host, Date.now());
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  kickedUsers.delete(sessionId);
  
  const embed = new EmbedBuilder()
    .setTitle('💀 Bounty Hunt Complete!')
    .setDescription(`**Leader:** ${session.hostName}`)
    .addFields(
      { name: '💵 Total Cash', value: `$${session.totalCash}`, inline: true },
      { name: '🥇 Total Gold', value: `${session.totalGold.toFixed(2)}`, inline: true },
      { name: '🎯 Bounties', value: `${session.bountiesCompleted}`, inline: true },
      { name: '👥 Posse', value: session.players.map(p => p.name).join(', '), inline: false }
    )
    .setColor(0x00FF00)
    .setTimestamp();
  
  await interaction.update({ embeds: [embed], components: [] });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function cleanupSession(session, client) {
  if (session.voiceChannel) {
    try {
      const channel = await client.channels.fetch(session.voiceChannel);
      if (channel) await channel.delete();
    } catch (e) {}
  }
}

function checkSessionTimeouts(client) {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions) {
    if (now - session.createdAt > BOUNTY_CONFIG.sessionTimeout) {
      cleanupSession(session, client);
      activeSessions.delete(sessionId);
      kickedUsers.delete(sessionId);
    }
  }
}

async function createTables(client) {
  console.log('[BOUNTY LFG] Using in-memory session storage');
}

module.exports = {
  initialize,
  createSession,
  createTables
};
