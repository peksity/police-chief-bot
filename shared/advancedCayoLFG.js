/**
 * ADVANCED CAYO PERICO LFG SYSTEM v4
 * - PSN Username required
 * - PS4/PS5 CROSS-GEN HANDLING
 * - 4 players max (1 leader + 3 crew)
 * - Kick + blacklist system
 * - DM notifications on end/cancel
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

const CAYO_CONFIG = {
  targets: {
    'pink_diamond': { name: '💎 Pink Diamond', payout: 1430000, description: 'BEST! $1.43M - Very rare.' },
    'bearer_bonds': { name: '📜 Bearer Bonds', payout: 1210000, description: '$1.21M - Common spawn.' },
    'ruby_necklace': { name: '💍 Ruby Necklace', payout: 1100000, description: '$1.1M - Moderate.' },
    'madrazo_files': { name: '📁 Madrazo Files', payout: 1210000, description: '$1.21M - First heist only.' },
    'tequila': { name: '🍾 Tequila', payout: 990000, description: '$990K - Lowest. Most common.' }
  },
  
  approaches: {
    'drainage': { name: '🚿 Drainage Tunnel', description: 'FASTEST! Swim in. Needs Cutting Torch.' },
    'main_dock': { name: '🚢 Main Dock', description: 'Boat approach. Quick exit.' },
    'north_dock': { name: '⚓ North Dock', description: 'Stealth from north.' },
    'airstrip': { name: '✈️ Airstrip', description: 'Fly in via Velum.' },
    'halo_jump': { name: '🪂 HALO Jump', description: 'Parachute anywhere.' }
  },
  
  secondary: {
    'gold': { name: '🥇 Gold', description: '$330K/stack. Needs 2 players.' },
    'cocaine': { name: '❄️ Cocaine', description: '$220K/stack. Solo friendly.' },
    'weed': { name: '🌿 Weed', description: '$150K/stack. Common.' },
    'cash': { name: '💵 Cash', description: '$90K/stack. Avoid.' }
  },
  
  // GTA VERSION OPTIONS - Critical for cross-gen play
  gtaVersions: {
    'ps5_enhanced': { 
      name: '🎮 PS5 Enhanced', 
      emoji: '🔵',
      description: 'Native PS5 version (better graphics). ONLY plays with other PS5 Enhanced players.',
      compatibleWith: ['ps5_enhanced'],
      warning: null
    },
    'ps4_version': { 
      name: '📀 PS4 Version', 
      emoji: '🟣',
      description: 'PS4 disc/digital version. Plays with PS4 AND PS5 players running PS4 version.',
      compatibleWith: ['ps4_version', 'ps5_playing_ps4'],
      warning: null
    },
    'ps5_playing_ps4': { 
      name: '🔄 PS5 (Running PS4 Version)', 
      emoji: '🟡',
      description: 'PS5 console but running the PS4 version for cross-gen play.',
      compatibleWith: ['ps4_version', 'ps5_playing_ps4'],
      warning: '⚠️ Must download PS4 version from library. May need new character.'
    }
  },
  
  maxPlayers: 4,
  minPlayers: 2,
  sessionTimeout: 30 * 60 * 1000
};

const activeSessions = new Map();
const userCooldowns = new Map();
const kickedUsers = new Map();

function initialize(client) {
  console.log('[CAYO LFG] Initializing v4 with cross-gen support...');
  
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isButton()) await handleButton(interaction, client);
      if (interaction.isStringSelectMenu()) await handleSelectMenu(interaction, client);
      if (interaction.isModalSubmit()) await handleModal(interaction, client);
    } catch (e) {
      console.error('[CAYO LFG] Error:', e);
    }
  });
  
  setInterval(() => checkTimeouts(client), 60000);
  console.log('[CAYO LFG] ✅ v4 initialized with PS4/PS5 cross-gen handling');
}

async function createSession(message, client) {
  const userId = message.author.id;
  
  const cooldown = userCooldowns.get(userId);
  if (cooldown && Date.now() - cooldown < 5 * 60 * 1000) {
    const remaining = Math.ceil((5 * 60 * 1000 - (Date.now() - cooldown)) / 1000);
    return message.reply(`⏳ Wait ${remaining}s before hosting another heist.`);
  }
  
  for (const [, session] of activeSessions) {
    if (session.userId === userId) {
      return message.reply(`❌ You already have an active heist!`);
    }
  }
  
  const sessionId = `cayo_${Date.now()}_${userId}`;
  
  const session = {
    id: sessionId,
    userId: userId,
    username: message.author.username,
    psnUsername: null,
    gtaVersion: null, // NEW: Track GTA version
    players: [],
    target: null,
    approach: null,
    secondary: null,
    b2b: true,
    status: 'setup',
    voiceChannel: null,
    messageId: null,
    channelId: message.channel.id,
    guildId: message.guild.id,
    createdAt: Date.now(),
    totalEarnings: 0,
    runsCompleted: 0
  };
  
  kickedUsers.set(sessionId, new Set());
  activeSessions.set(sessionId, session);
  
  // First: Ask for GTA version
  const embed = new EmbedBuilder()
    .setTitle('🏝️ CAYO PERICO - SELECT YOUR GTA VERSION')
    .setDescription(
      `**Host:** ${session.username}\n\n` +
      `⚠️ **IMPORTANT: PS4 & PS5 Enhanced are on DIFFERENT servers!**\n\n` +
      `Select which version of GTA you're running:`
    )
    .addFields(
      { 
        name: '🔵 PS5 Enhanced', 
        value: 'Native PS5 version with better graphics.\n**Only plays with other PS5 Enhanced players.**', 
        inline: false 
      },
      { 
        name: '🟣 PS4 Version', 
        value: 'Standard PS4 version.\n**Plays with PS4 & PS5 players running PS4 version.**', 
        inline: false 
      },
      { 
        name: '🟡 PS5 (Running PS4 Version)', 
        value: 'You have PS5 but downloaded the PS4 version to play with PS4 friends.\n**Cross-gen compatible!**', 
        inline: false 
      }
    )
    .setColor(0x00D4FF)
    .setFooter({ text: 'This ensures everyone can actually join your lobby!' });
  
  const versionSelect = new StringSelectMenuBuilder()
    .setCustomId(`cayo_version_${sessionId}`)
    .setPlaceholder('🎮 Select Your GTA Version')
    .addOptions([
      { 
        label: 'PS5 Enhanced', 
        description: 'Native PS5 - Only with other PS5 Enhanced', 
        value: 'ps5_enhanced', 
        emoji: '🔵' 
      },
      { 
        label: 'PS4 Version', 
        description: 'PS4 disc/digital - Cross-gen compatible', 
        value: 'ps4_version', 
        emoji: '🟣' 
      },
      { 
        label: 'PS5 Running PS4 Version', 
        description: 'PS5 with PS4 version installed - Cross-gen', 
        value: 'ps5_playing_ps4', 
        emoji: '🟡' 
      }
    ]);
  
  const row = new ActionRowBuilder().addComponents(versionSelect);
  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cayo_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );
  
  const msg = await message.channel.send({ embeds: [embed], components: [row, cancelRow] });
  session.messageId = msg.id;
  
  return session;
}

async function handleModal(interaction, client) {
  const customId = interaction.customId;
  
  if (customId.startsWith('cayo_psnmodal_')) {
    const sessionId = customId.replace('cayo_psnmodal_', '');
    const session = activeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    
    const psn = interaction.fields.getTextInputValue('psn_input');
    session.psnUsername = psn;
    session.players.push({ userId: session.userId, username: session.username, psn, gtaVersion: session.gtaVersion });
    
    const embed = createSetupEmbed(session);
    const components = createSetupComponents(sessionId, session);
    await interaction.update({ embeds: [embed], components });
  }
  
  if (customId.startsWith('cayo_joinmodal_')) {
    const sessionId = customId.replace('cayo_joinmodal_', '');
    const session = activeSessions.get(sessionId);
    if (!session) return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    
    const psn = interaction.fields.getTextInputValue('psn_input');
    const pendingVersion = session.pendingJoinVersion;
    
    session.players.push({ 
      userId: interaction.user.id, 
      username: interaction.user.username, 
      psn,
      gtaVersion: pendingVersion
    });
    
    delete session.pendingJoinVersion;
    
    const embed = createRecruitingEmbed(session);
    const components = createRecruitingComponents(sessionId, session);
    await interaction.update({ embeds: [embed], components });
    
    const versionInfo = CAYO_CONFIG.gtaVersions[pendingVersion];
    await interaction.channel.send({ 
      content: `🎮 **${psn}** joined! (${versionInfo.emoji} ${versionInfo.name}) | ${session.players.length}/${CAYO_CONFIG.maxPlayers}` 
    });
  }
}

function createSetupEmbed(session) {
  const targetInfo = session.target ? CAYO_CONFIG.targets[session.target] : null;
  const approachInfo = session.approach ? CAYO_CONFIG.approaches[session.approach] : null;
  const secondaryInfo = session.secondary ? CAYO_CONFIG.secondary[session.secondary] : null;
  const versionInfo = CAYO_CONFIG.gtaVersions[session.gtaVersion];
  
  // Compatibility message
  let compatMsg = '';
  if (session.gtaVersion === 'ps5_enhanced') {
    compatMsg = '🔵 **PS5 Enhanced ONLY** - Other PS5 Enhanced players can join';
  } else {
    compatMsg = '🟢 **Cross-Gen Compatible** - PS4 & PS5 (running PS4 version) can join';
  }
  
  return new EmbedBuilder()
    .setTitle('🏝️ CAYO PERICO - SETUP')
    .setDescription(
      `**Host:** ${session.username}\n` +
      `**PSN:** ${session.psnUsername}\n` +
      `**Version:** ${versionInfo.emoji} ${versionInfo.name}\n\n` +
      `${compatMsg}`
    )
    .addFields(
      { name: '🎯 Target', value: targetInfo ? `✅ **${targetInfo.name}**\n${targetInfo.description}` : '❓ **Not selected**', inline: false },
      { name: '🚀 Approach', value: approachInfo ? `✅ **${approachInfo.name}**\n${approachInfo.description}` : '❓ **Not selected**', inline: false },
      { name: '💰 Secondary', value: secondaryInfo ? `✅ **${secondaryInfo.name}**\n${secondaryInfo.description}` : '❓ **Not selected**', inline: false },
      { name: '🔄 B2B', value: session.b2b ? '✅ **ON** - Back-to-back runs!' : '❌ **OFF**', inline: false }
    )
    .setColor(0x00D4FF)
    .setFooter({ text: 'Select options, then Start Recruiting' })
    .setTimestamp();
}

function createRecruitingEmbed(session) {
  const targetInfo = CAYO_CONFIG.targets[session.target];
  const approachInfo = CAYO_CONFIG.approaches[session.approach];
  const hostVersion = CAYO_CONFIG.gtaVersions[session.gtaVersion];
  
  // Build player list with version indicators
  let playerList = '';
  for (let i = 0; i < CAYO_CONFIG.maxPlayers; i++) {
    if (session.players[i]) {
      const p = session.players[i];
      const isHost = p.userId === session.userId;
      const vInfo = CAYO_CONFIG.gtaVersions[p.gtaVersion];
      playerList += `${i + 1}. ${isHost ? '👑' : '🎮'} **${p.psn}** ${vInfo.emoji} ${isHost ? '(Leader)' : ''}\n`;
    } else {
      playerList += `${i + 1}. ⬜ *Open Slot*\n`;
    }
  }
  
  // Compatibility banner
  let compatBanner = '';
  if (session.gtaVersion === 'ps5_enhanced') {
    compatBanner = '🔵 **PS5 ENHANCED ONLY** - Must have PS5 Enhanced version';
  } else {
    compatBanner = '🟢 **CROSS-GEN** - PS4 & PS5 (with PS4 version) welcome!';
  }
  
  return new EmbedBuilder()
    .setTitle('🏝️ CAYO PERICO - RECRUITING')
    .setDescription(
      `**Host:** ${session.psnUsername} ${hostVersion.emoji}\n\n` +
      `**${targetInfo.name}** • **${approachInfo.name}** • ${session.b2b ? '**B2B: ON**' : 'Single'}\n\n` +
      `${compatBanner}`
    )
    .addFields(
      { name: '👥 Crew (1+3)', value: playerList, inline: true },
      { name: '📊 Info', value: `Slots: **${session.players.length}/${CAYO_CONFIG.maxPlayers}**\nPer Run: **$${targetInfo.payout.toLocaleString()}**\nStatus: ${session.status === 'in_progress' ? '🟢 **IN PROGRESS**' : '🟡 **RECRUITING**'}`, inline: true }
    )
    .setColor(session.status === 'in_progress' ? 0x00FF00 : 0x00D4FF)
    .setFooter({ text: `Click Join! Make sure you have the right GTA version!` })
    .setTimestamp();
}

function createSetupComponents(sessionId, session) {
  const targetSelect = new StringSelectMenuBuilder()
    .setCustomId(`cayo_target_${sessionId}`)
    .setPlaceholder(session.target ? `✅ ${CAYO_CONFIG.targets[session.target].name}` : '🎯 Select Target')
    .addOptions(Object.entries(CAYO_CONFIG.targets).map(([k, v]) => ({
      label: v.name.replace(/[^\w\s]/g, '').trim(),
      description: v.description.slice(0, 50),
      value: k,
      default: session.target === k
    })));
  
  const approachSelect = new StringSelectMenuBuilder()
    .setCustomId(`cayo_approach_${sessionId}`)
    .setPlaceholder(session.approach ? `✅ ${CAYO_CONFIG.approaches[session.approach].name}` : '🚀 Select Approach')
    .addOptions(Object.entries(CAYO_CONFIG.approaches).map(([k, v]) => ({
      label: v.name.replace(/[^\w\s]/g, '').trim(),
      description: v.description.slice(0, 50),
      value: k,
      default: session.approach === k
    })));
  
  const secondarySelect = new StringSelectMenuBuilder()
    .setCustomId(`cayo_secondary_${sessionId}`)
    .setPlaceholder(session.secondary ? `✅ ${CAYO_CONFIG.secondary[session.secondary].name}` : '💰 Select Secondary')
    .addOptions(Object.entries(CAYO_CONFIG.secondary).map(([k, v]) => ({
      label: v.name.replace(/[^\w\s]/g, '').trim(),
      description: v.description.slice(0, 50),
      value: k,
      default: session.secondary === k
    })));
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cayo_b2b_${sessionId}`).setLabel(session.b2b ? 'B2B: ON' : 'B2B: OFF').setStyle(session.b2b ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🔄'),
    new ButtonBuilder().setCustomId(`cayo_start_${sessionId}`).setLabel('Start Recruiting').setStyle(ButtonStyle.Primary).setEmoji('🚀'),
    new ButtonBuilder().setCustomId(`cayo_cancel_${sessionId}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );
  
  return [
    new ActionRowBuilder().addComponents(targetSelect),
    new ActionRowBuilder().addComponents(approachSelect),
    new ActionRowBuilder().addComponents(secondarySelect),
    buttons
  ];
}

function createRecruitingComponents(sessionId, session) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cayo_join_${sessionId}`).setLabel('Join Heist').setStyle(ButtonStyle.Success).setEmoji('🎮'),
    new ButtonBuilder().setCustomId(`cayo_leave_${sessionId}`).setLabel('Leave').setStyle(ButtonStyle.Secondary).setEmoji('🚪'),
    new ButtonBuilder().setCustomId(`cayo_voice_${sessionId}`).setLabel('Create Voice').setStyle(ButtonStyle.Primary).setEmoji('🔊')
  );
  
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cayo_ready_${sessionId}`).setLabel('Start Heist').setStyle(ButtonStyle.Success).setEmoji('🚀'),
    new ButtonBuilder().setCustomId(`cayo_complete_${sessionId}`).setLabel('Complete').setStyle(ButtonStyle.Primary).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`cayo_end_${sessionId}`).setLabel('End Session').setStyle(ButtonStyle.Danger).setEmoji('🛑')
  );
  
  const components = [row1, row2];
  
  if (session.players.length > 1) {
    const kickOptions = session.players.filter(p => p.userId !== session.userId).map(p => ({
      label: `Kick ${p.psn}`, value: p.userId, emoji: '👢'
    }));
    if (kickOptions.length > 0) {
      components.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`cayo_kick_${sessionId}`).setPlaceholder('👢 Kick player').addOptions(kickOptions)
      ));
    }
  }
  
  return components;
}

// Create join components - asks for GTA version first
function createJoinVersionComponents(sessionId, session) {
  const hostVersion = session.gtaVersion;
  const compatibleVersions = CAYO_CONFIG.gtaVersions[hostVersion].compatibleWith;
  
  const options = Object.entries(CAYO_CONFIG.gtaVersions)
    .filter(([k]) => compatibleVersions.includes(k))
    .map(([k, v]) => ({
      label: v.name.replace(/[^\w\s]/g, '').trim(),
      description: v.description.slice(0, 50),
      value: k,
      emoji: v.emoji
    }));
  
  const versionSelect = new StringSelectMenuBuilder()
    .setCustomId(`cayo_joinversion_${sessionId}`)
    .setPlaceholder('🎮 Select Your GTA Version to Join')
    .addOptions(options);
  
  return [new ActionRowBuilder().addComponents(versionSelect)];
}

async function handleButton(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('cayo_')) return;
  
  const parts = customId.split('_');
  const action = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  if (!session && action !== 'cancel') {
    return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
  }
  
  switch (action) {
    case 'b2b':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      session.b2b = !session.b2b;
      await interaction.update({ embeds: [createSetupEmbed(session)], components: createSetupComponents(sessionId, session) });
      break;
      
    case 'start':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      if (!session.target || !session.approach) return interaction.reply({ content: '❌ Select target and approach!', ephemeral: true });
      session.status = 'recruiting';
      await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      
      const hostVersion = CAYO_CONFIG.gtaVersions[session.gtaVersion];
      let recruitMsg = `🏝️ **CAYO HEIST OPEN!** ${hostVersion.emoji} ${hostVersion.name}\n`;
      recruitMsg += `🎯 ${CAYO_CONFIG.targets[session.target].name} | `;
      if (session.gtaVersion === 'ps5_enhanced') {
        recruitMsg += '**PS5 Enhanced players ONLY!**';
      } else {
        recruitMsg += '**Cross-Gen: PS4 & PS5 (with PS4 version) welcome!**';
      }
      await interaction.channel.send({ content: recruitMsg });
      break;
      
    case 'join':
      const kicked = kickedUsers.get(sessionId);
      if (kicked?.has(interaction.user.id)) return interaction.reply({ content: '❌ Removed from this session.', ephemeral: true });
      if (session.players.some(p => p.userId === interaction.user.id)) return interaction.reply({ content: '❌ Already joined!', ephemeral: true });
      if (session.players.length >= CAYO_CONFIG.maxPlayers) return interaction.reply({ content: '❌ Full!', ephemeral: true });
      
      // Show version selection for joiner
      const joinEmbed = new EmbedBuilder()
        .setTitle('🎮 Select Your GTA Version')
        .setDescription(
          `**To join this heist, confirm your GTA version:**\n\n` +
          (session.gtaVersion === 'ps5_enhanced' 
            ? '🔵 This is a **PS5 Enhanced** lobby.\nYou must have the PS5 Enhanced version to join.'
            : '🟢 This is a **Cross-Gen** lobby.\nPS4 players and PS5 players running the PS4 version can join.')
        )
        .setColor(0x00D4FF);
      
      await interaction.reply({ 
        embeds: [joinEmbed], 
        components: createJoinVersionComponents(sessionId, session),
        ephemeral: true 
      });
      break;
      
    case 'leave':
      if (interaction.user.id === session.userId) return interaction.reply({ content: '❌ Use End Session.', ephemeral: true });
      const idx = session.players.findIndex(p => p.userId === interaction.user.id);
      if (idx === -1) return interaction.reply({ content: '❌ Not in session.', ephemeral: true });
      session.players.splice(idx, 1);
      await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      break;
      
    case 'voice':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      if (session.voiceChannel) return interaction.reply({ content: `🔊 <#${session.voiceChannel}>`, ephemeral: true });
      const cat = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('gta'));
      const vc = await interaction.guild.channels.create({ name: `🏝️ Cayo - ${session.psnUsername}`, type: ChannelType.GuildVoice, parent: cat?.id, userLimit: 4 });
      session.voiceChannel = vc.id;
      await interaction.reply({ content: `🔊 <#${vc.id}>` });
      break;
      
    case 'ready':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      if (session.players.length < 2) return interaction.reply({ content: '❌ Need 2+ players!', ephemeral: true });
      session.status = 'in_progress';
      await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      await interaction.channel.send({ content: `🚀 **HEIST STARTING!** ${session.players.map(p => `<@${p.userId}>`).join(' ')}` });
      break;
      
    case 'complete':
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      session.runsCompleted++;
      session.totalEarnings += CAYO_CONFIG.targets[session.target].payout;
      await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
      await interaction.channel.send({ content: `💰 **RUN #${session.runsCompleted} COMPLETE!** +$${CAYO_CONFIG.targets[session.target].payout.toLocaleString()}` });
      break;
      
    case 'cancel':
    case 'end':
      if (!session) {
        activeSessions.delete(sessionId);
        return interaction.update({ embeds: [new EmbedBuilder().setTitle('❌ Cancelled').setColor(0xFF0000)], components: [] });
      }
      if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
      
      // DM all players
      for (const p of session.players.filter(x => x.userId !== session.userId)) {
        try {
          const user = await client.users.fetch(p.userId);
          await user.send({ 
            embeds: [new EmbedBuilder()
              .setTitle(action === 'cancel' ? '❌ Heist Cancelled' : '🏝️ Heist Ended')
              .setDescription(`**${session.psnUsername}**'s heist ${action === 'cancel' ? 'was cancelled' : 'ended'}.\n\nTotal: $${session.totalEarnings.toLocaleString()}`)
              .setColor(action === 'cancel' ? 0xFF0000 : 0x00FF00)] 
          });
        } catch (e) {}
      }
      
      // Announce
      if (session.players.length > 1) {
        const mentions = session.players.filter(p => p.userId !== session.userId).map(p => `<@${p.userId}>`).join(' ');
        await interaction.channel.send({ content: `${action === 'cancel' ? '❌ **HEIST CANCELLED**' : '🏝️ **HEIST ENDED**'} | ${mentions}` });
      }
      
      if (session.voiceChannel) { 
        try { const ch = await client.channels.fetch(session.voiceChannel); if (ch) await ch.delete(); } catch (e) {} 
      }
      
      activeSessions.delete(sessionId);
      kickedUsers.delete(sessionId);
      if (action === 'end') userCooldowns.set(session.userId, Date.now());
      
      await interaction.update({ 
        embeds: [new EmbedBuilder()
          .setTitle(action === 'cancel' ? '❌ Cancelled' : '🏝️ Complete!')
          .setDescription(`Total: $${session.totalEarnings.toLocaleString()}`)
          .setColor(action === 'cancel' ? 0xFF0000 : 0x00FF00)], 
        components: [] 
      });
      break;
  }
}

async function handleSelectMenu(interaction, client) {
  const customId = interaction.customId;
  if (!customId.startsWith('cayo_')) return;
  
  const parts = customId.split('_');
  const type = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  if (!session) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
  
  const value = interaction.values[0];
  
  // GTA Version selection (host setup)
  if (type === 'version') {
    if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
    
    session.gtaVersion = value;
    const versionInfo = CAYO_CONFIG.gtaVersions[value];
    
    // Show modal for PSN input
    const modal = new ModalBuilder().setCustomId(`cayo_psnmodal_${sessionId}`).setTitle('Enter PSN Username');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('psn_input').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16)
    ));
    
    // Show warning if applicable
    if (versionInfo.warning) {
      await interaction.reply({ 
        content: `${versionInfo.warning}\n\nClick the button below to continue.`,
        ephemeral: true 
      });
    }
    
    return interaction.showModal(modal);
  }
  
  // Join version selection
  if (type === 'joinversion') {
    const joinerVersion = value;
    const hostVersion = session.gtaVersion;
    
    // Double-check compatibility
    const compatible = CAYO_CONFIG.gtaVersions[hostVersion].compatibleWith.includes(joinerVersion);
    if (!compatible) {
      return interaction.reply({ 
        content: `❌ **Incompatible!** This lobby is ${CAYO_CONFIG.gtaVersions[hostVersion].name}. You selected ${CAYO_CONFIG.gtaVersions[joinerVersion].name}.\n\nThese versions cannot play together.`, 
        ephemeral: true 
      });
    }
    
    // Store version and show PSN modal
    session.pendingJoinVersion = joinerVersion;
    
    const modal = new ModalBuilder().setCustomId(`cayo_joinmodal_${sessionId}`).setTitle('Enter PSN');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('psn_input').setLabel('PSN Username').setStyle(TextInputStyle.Short).setRequired(true)
    ));
    
    return interaction.showModal(modal);
  }
  
  // Kick handler
  if (type === 'kick') {
    if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
    const kickId = value;
    const idx = session.players.findIndex(p => p.userId === kickId);
    if (idx === -1) return;
    const kicked = session.players.splice(idx, 1)[0];
    kickedUsers.get(sessionId)?.add(kickId);
    try { 
      const u = await client.users.fetch(kickId); 
      await u.send({ embeds: [new EmbedBuilder().setTitle('❌ Removed').setDescription(`Removed from ${session.psnUsername}'s heist.`).setColor(0xFF0000)] }); 
    } catch (e) {}
    await interaction.update({ embeds: [createRecruitingEmbed(session)], components: createRecruitingComponents(sessionId, session) });
    await interaction.channel.send({ content: `👢 **${kicked.psn}** was removed.` });
    return;
  }
  
  // Settings (host only)
  if (interaction.user.id !== session.userId) return interaction.reply({ content: '❌ Host only.', ephemeral: true });
  
  if (type === 'target') session.target = value;
  else if (type === 'approach') session.approach = value;
  else if (type === 'secondary') session.secondary = value;
  
  await interaction.update({ embeds: [createSetupEmbed(session)], components: createSetupComponents(sessionId, session) });
}

function checkTimeouts(client) {
  for (const [id, s] of activeSessions) {
    if (Date.now() - s.createdAt > CAYO_CONFIG.sessionTimeout) {
      if (s.voiceChannel) client.channels.fetch(s.voiceChannel).then(c => c?.delete()).catch(() => {});
      activeSessions.delete(id);
      kickedUsers.delete(id);
    }
  }
}

async function createTables() { console.log('[CAYO] In-memory with cross-gen support'); }

module.exports = { initialize, createSession, createTables };
