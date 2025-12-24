/**
 * ██████╗  ██████╗ ██╗   ██╗███╗   ██╗████████╗██╗   ██╗    ██╗     ███████╗ ██████╗ 
 * ██╔══██╗██╔═══██╗██║   ██║████╗  ██║╚══██╔══╝╚██╗ ██╔╝    ██║     ██╔════╝██╔════╝ 
 * ██████╔╝██║   ██║██║   ██║██╔██╗ ██║   ██║    ╚████╔╝     ██║     █████╗  ██║  ███╗
 * ██╔══██╗██║   ██║██║   ██║██║╚██╗██║   ██║     ╚██╔╝      ██║     ██╔══╝  ██║   ██║
 * ██████╔╝╚██████╔╝╚██████╔╝██║ ╚████║   ██║      ██║       ███████╗██║     ╚██████╔╝
 * ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝   ╚═╝      ╚═╝       ╚══════╝╚═╝      ╚═════╝ 
 * 
 * ADVANCED BOUNTY HUNTER LFG SYSTEM
 * Hunt down outlaws for cash and gold
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
  // Bounty types
  bountyTypes: {
    'regular': { name: '⭐ Regular Bounty', payout: { min: 10, max: 25 }, gold: 0.24, difficulty: 'Easy' },
    'legendary': { name: '🌟 Legendary Bounty', payout: { min: 100, max: 225 }, gold: 0.48, difficulty: 'Hard' },
    'infamous': { name: '💀 Infamous Bounty', payout: { min: 50, max: 150 }, gold: 0.36, difficulty: 'Medium' }
  },
  
  // Legendary bounties list
  legendaryBounties: {
    'etta_doyle': { name: '👩 Etta Doyle', difficulty: 5, strategy: 'Wait for her to come to you' },
    'cecil_tucker': { name: '🎭 Cecil C. Tucker', difficulty: 3, strategy: 'Theater showdown' },
    'tobin_winfield': { name: '🏛️ Tobin Winfield', difficulty: 4, strategy: 'Ex-senator hideout' },
    'sergio_vincenza': { name: '🎨 Sergio Vincenza', difficulty: 3, strategy: 'Artist turned outlaw' },
    'philip_carlier': { name: '🐊 Philip Carlier', difficulty: 4, strategy: 'Swamp hunt' },
    'owlhoot': { name: '🦉 Owlhoot Family', difficulty: 5, strategy: 'Family of outlaws' },
    'red_ben': { name: '🔴 Red Ben Clempson', difficulty: 5, strategy: 'Train robbery mastermind' },
    'yukon_nik': { name: '❄️ Yukon Nik', difficulty: 4, strategy: 'Cold-blooded killer' },
    'gene_beau': { name: '🎪 Gene "Beau" Finley', difficulty: 3, strategy: 'Carnival con-man' },
    'carmela': { name: '🔥 Carmela "La Muñeca"', difficulty: 4, strategy: 'Ruthless bandit leader' }
  },
  
  // Payout strategy
  payoutStrategy: {
    'speed': { name: '⚡ Speed Run', description: 'Fast completion, lower payout' },
    'timer': { name: '⏱️ Timer Method', description: 'Wait for max payout (12+ mins)' }
  },
  
  // Session settings
  minPlayers: 1, // Can solo bounties
  maxPlayers: 4,
  sessionTimeout: 30 * 60 * 1000,
  voiceChannelTimeout: 10 * 60 * 1000
};

// Active sessions storage
const activeSessions = new Map();
const userCooldowns = new Map();

// ============================================
// INITIALIZE LFG SYSTEM
// ============================================

function initialize(client) {
  console.log('[BOUNTY LFG] Initializing advanced Bounty Hunter LFG system...');
  
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
      await handleButton(interaction, client);
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction, client);
    }
  });
  
  setInterval(() => checkSessionTimeouts(client), 60000);
  
  console.log('[BOUNTY LFG] ✅ Advanced Bounty LFG system initialized');
}

// ============================================
// CREATE NEW SESSION
// ============================================

async function createSession(message, client) {
  const userId = message.author.id;
  const guild = message.guild;
  
  // Check cooldown
  const cooldown = userCooldowns.get(userId);
  if (cooldown && Date.now() - cooldown < 2 * 60 * 1000) {
    const remaining = Math.ceil((2 * 60 * 1000 - (Date.now() - cooldown)) / 1000);
    return message.reply(`⏳ Easy there, hunter. Wait ${remaining} seconds before posting another bounty.`);
  }
  
  // Check existing session
  for (const [sessionId, session] of activeSessions) {
    if (session.host === userId) {
      return message.reply(`❌ You already have an active bounty! End it first with \`?endbounty\``);
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
    bountyType: null,
    legendaryTarget: null,
    payoutStrategy: 'timer', // Default to max payout
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
  
  const setupEmbed = await createSetupEmbed(session, guild);
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
// EMBEDS
// ============================================

async function createSetupEmbed(session, guild) {
  const host = await guild.members.fetch(session.host).catch(() => null);
  
  const embed = new EmbedBuilder()
    .setTitle('🎯 BOUNTY HUNT - SETUP')
    .setDescription(`**Host:** ${host?.user.tag || 'Unknown'}\n**Platform:** ${session.platform}\n\n*Configure your bounty hunt below*`)
    .addFields(
      { name: '🎯 Bounty Type', value: session.bountyType ? BOUNTY_CONFIG.bountyTypes[session.bountyType].name : '❓ Not selected', inline: true },
      { name: '⏱️ Payout Strategy', value: BOUNTY_CONFIG.payoutStrategy[session.payoutStrategy].name, inline: true }
    )
    .setColor(0xDC143C)
    .setFooter({ text: 'Select your options, then click "Start Recruiting"' })
    .setTimestamp();
  
  if (session.bountyType === 'legendary' && session.legendaryTarget) {
    const target = BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget];
    embed.addFields(
      { name: '🎯 Target', value: target.name, inline: true },
      { name: '⚔️ Difficulty', value: '⭐'.repeat(target.difficulty), inline: true },
      { name: '💡 Strategy', value: target.strategy, inline: false }
    );
  }
  
  if (session.bountyType) {
    const bounty = BOUNTY_CONFIG.bountyTypes[session.bountyType];
    embed.addFields({ 
      name: '💰 Potential Payout', 
      value: `$${bounty.payout.min}-$${bounty.payout.max} + ${bounty.gold} Gold`, 
      inline: false 
    });
  }
  
  return embed;
}

async function createRecruitingEmbed(session, guild) {
  const host = await guild.members.fetch(session.host).catch(() => null);
  const elapsed = session.startedAt ? formatTime(Date.now() - session.startedAt) : '0:00';
  
  let playerList = '';
  for (let i = 0; i < BOUNTY_CONFIG.maxPlayers; i++) {
    if (session.players[i]) {
      const player = session.players[i];
      const isHost = player.userId === session.host;
      playerList += `${i + 1}. ${isHost ? '⭐' : '🔫'} **${player.name}** ${isHost ? '(Lead Hunter)' : ''}\n`;
    } else {
      playerList += `${i + 1}. ⬜ *Empty Slot*\n`;
    }
  }
  
  const bountyInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const strategyInfo = BOUNTY_CONFIG.payoutStrategy[session.payoutStrategy];
  
  let targetInfo = '';
  if (session.bountyType === 'legendary' && session.legendaryTarget) {
    const target = BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget];
    targetInfo = `\n🎯 **Target:** ${target.name}\n⚔️ **Difficulty:** ${'⭐'.repeat(target.difficulty)}`;
  }
  
  const embed = new EmbedBuilder()
    .setTitle(`🎯 BOUNTY HUNT - RECRUITING`)
    .setDescription(`
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
${bountyInfo.name}${targetInfo}
⏱️ **Strategy:** ${strategyInfo.name}
💰 **Payout:** $${bountyInfo.payout.min}-$${bountyInfo.payout.max} + ${bountyInfo.gold}g
🎮 **Platform:** ${session.platform} Only
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
    `)
    .addFields(
      { name: `🔫 Hunters (${session.players.length}/${BOUNTY_CONFIG.maxPlayers})`, value: playerList, inline: false }
    )
    .setColor(session.players.length >= BOUNTY_CONFIG.minPlayers ? 0x00FF00 : 0xDC143C)
    .setFooter({ text: `Session ID: ${session.id.slice(-8)} • ⏱️ ${elapsed}` })
    .setTimestamp();
  
  if (session.voiceChannel) {
    embed.addFields({ name: '🔊 Voice Channel', value: `<#${session.voiceChannel}>`, inline: true });
  }
  
  if (session.bountiesCompleted > 0) {
    embed.addFields(
      { name: '🎯 Bounties Caught', value: `${session.bountiesCompleted}`, inline: true },
      { name: '💵 Cash Earned', value: `$${session.totalCash.toLocaleString()}`, inline: true },
      { name: '🥇 Gold Earned', value: `${session.totalGold.toFixed(2)}`, inline: true }
    );
  }
  
  return embed;
}

// ============================================
// COMPONENTS
// ============================================

function createSetupComponents(sessionId, session) {
  const bountySelect = new StringSelectMenuBuilder()
    .setCustomId(`bounty_type_${sessionId}`)
    .setPlaceholder('🎯 Select Bounty Type')
    .addOptions(
      Object.entries(BOUNTY_CONFIG.bountyTypes).map(([key, value]) => ({
        label: value.name.replace(/[^\w\s]/g, '').trim(),
        description: `${value.difficulty} | $${value.payout.min}-$${value.payout.max} + ${value.gold}g`,
        value: key
      }))
    );
  
  const rows = [new ActionRowBuilder().addComponents(bountySelect)];
  
  // Add legendary target selector if legendary is selected
  if (session.bountyType === 'legendary') {
    const legendarySelect = new StringSelectMenuBuilder()
      .setCustomId(`bounty_legendary_${sessionId}`)
      .setPlaceholder('🌟 Select Legendary Target')
      .addOptions(
        Object.entries(BOUNTY_CONFIG.legendaryBounties).map(([key, value]) => ({
          label: value.name.replace(/[^\w\s]/g, '').trim(),
          description: `Difficulty: ${'★'.repeat(value.difficulty)}`,
          value: key
        }))
      );
    rows.push(new ActionRowBuilder().addComponents(legendarySelect));
  }
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bounty_strategy_${sessionId}`)
      .setLabel(`Strategy: ${session.payoutStrategy === 'timer' ? '⏱️ Timer' : '⚡ Speed'}`)
      .setStyle(session.payoutStrategy === 'timer' ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji(session.payoutStrategy === 'timer' ? '⏱️' : '⚡'),
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
  rows.push(buttons);
  
  return rows;
}

function createRecruitingComponents(sessionId, session) {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bounty_join_${sessionId}`)
      .setLabel(`Join Hunt (${session.players.length}/${BOUNTY_CONFIG.maxPlayers})`)
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔫')
      .setDisabled(session.players.length >= BOUNTY_CONFIG.maxPlayers),
    new ButtonBuilder()
      .setCustomId(`bounty_leave_${sessionId}`)
      .setLabel('Leave')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🚪'),
    new ButtonBuilder()
      .setCustomId(`bounty_ready_${sessionId}`)
      .setLabel('Start Hunt!')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎯')
  );
  
  const hostButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bounty_complete_${sessionId}`)
      .setLabel('Bounty Caught!')
      .setStyle(ButtonStyle.Success)
      .setEmoji('💰'),
    new ButtonBuilder()
      .setCustomId(`bounty_failed_${sessionId}`)
      .setLabel('Target Escaped')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('💨'),
    new ButtonBuilder()
      .setCustomId(`bounty_voice_${sessionId}`)
      .setLabel('Create Voice')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔊')
      .setDisabled(session.voiceChannel !== null),
    new ButtonBuilder()
      .setCustomId(`bounty_end_${sessionId}`)
      .setLabel('End Session')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🛑')
  );
  
  return [buttons, hostButtons];
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
    return interaction.reply({ content: '❌ Session not found or expired.', ephemeral: true });
  }
  
  try {
    switch (action) {
      case 'strategy':
        await handleStrategyToggle(interaction, session, sessionId);
        break;
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
      case 'ready':
        await handleReadyUp(interaction, session, sessionId, client);
        break;
      case 'complete':
        await handleBountyComplete(interaction, session, sessionId, client);
        break;
      case 'failed':
        await handleBountyFailed(interaction, session, sessionId, client);
        break;
      case 'voice':
        await handleCreateVoice(interaction, session, sessionId, client);
        break;
      case 'end':
        await handleEndSession(interaction, session, sessionId, client);
        break;
    }
  } catch (error) {
    console.error('[BOUNTY LFG] Button error:', error);
    interaction.reply({ content: '❌ An error occurred.', ephemeral: true }).catch(() => {});
  }
}

async function handleStrategyToggle(interaction, session, sessionId) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the lead hunter can change settings.', ephemeral: true });
  }
  
  session.payoutStrategy = session.payoutStrategy === 'timer' ? 'speed' : 'timer';
  
  const embed = await createSetupEmbed(session, interaction.guild);
  const components = createSetupComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
}

async function handleStartRecruiting(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the lead hunter can start recruiting.', ephemeral: true });
  }
  
  if (!session.bountyType) {
    return interaction.reply({ content: '❌ Please select a bounty type first!', ephemeral: true });
  }
  
  if (session.bountyType === 'legendary' && !session.legendaryTarget) {
    return interaction.reply({ content: '❌ Please select a legendary target!', ephemeral: true });
  }
  
  session.status = 'recruiting';
  session.startedAt = Date.now();
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  const bountyInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  await interaction.channel.send({
    content: `🎯 **BOUNTY POSTED!** ${bountyInfo.name} | ${session.platform} | Looking for hunters!`,
    allowedMentions: { parse: [] }
  });
}

async function handleCancelSession(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the lead hunter can cancel.', ephemeral: true });
  }
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  
  const embed = new EmbedBuilder()
    .setTitle('❌ Bounty Hunt Cancelled')
    .setDescription('The lead hunter cancelled this bounty.')
    .setColor(0xFF0000);
  
  await interaction.update({ embeds: [embed], components: [] });
}

async function handleJoinSession(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  if (session.players.find(p => p.userId === userId)) {
    return interaction.reply({ content: '❌ You\'re already on this hunt!', ephemeral: true });
  }
  
  // Platform check
  const member = await interaction.guild.members.fetch(userId);
  const isPS5 = member.roles.cache.some(r => r.name.includes('PS5') || r.name.includes('Primary: PS5'));
  const isPS4 = member.roles.cache.some(r => r.name.includes('PS4') || r.name.includes('Primary: PS4'));
  const userPlatform = isPS5 ? 'PS5' : isPS4 ? 'PS4' : 'Unknown';
  
  if (session.platform !== 'Unknown' && userPlatform !== 'Unknown' && session.platform !== userPlatform) {
    return interaction.reply({ 
      content: `❌ Platform mismatch! This bounty is for **${session.platform}** hunters only.`, 
      ephemeral: true 
    });
  }
  
  if (session.players.length >= BOUNTY_CONFIG.maxPlayers) {
    return interaction.reply({ content: '❌ Hunt party is full!', ephemeral: true });
  }
  
  session.players.push({ userId: userId, name: interaction.user.username });
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await interaction.channel.send({
    content: `🔫 **${interaction.user.username}** joined the hunt! (${session.players.length}/${BOUNTY_CONFIG.maxPlayers})`,
    allowedMentions: { parse: [] }
  });
}

async function handleLeaveSession(interaction, session, sessionId, client) {
  const userId = interaction.user.id;
  
  if (userId === session.host) {
    return interaction.reply({ content: '❌ You\'re the lead hunter! Use "End Session" to close.', ephemeral: true });
  }
  
  const playerIndex = session.players.findIndex(p => p.userId === userId);
  if (playerIndex === -1) {
    return interaction.reply({ content: '❌ You\'re not on this hunt.', ephemeral: true });
  }
  
  session.players.splice(playerIndex, 1);
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
}

async function handleReadyUp(interaction, session, sessionId, client) {
  session.status = 'in_progress';
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  embed.setTitle('🎯 BOUNTY HUNT - IN PROGRESS');
  embed.setColor(0x00FF00);
  
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  const mentions = session.players.map(p => `<@${p.userId}>`).join(' ');
  let targetMsg = '';
  if (session.bountyType === 'legendary' && session.legendaryTarget) {
    const target = BOUNTY_CONFIG.legendaryBounties[session.legendaryTarget];
    targetMsg = `\n**Target:** ${target.name}\n**Tip:** ${target.strategy}`;
  }
  
  await interaction.channel.send({
    content: `🎯 **HUNT BEGINS!** ${mentions}${targetMsg}\n\nBring 'em in dead or alive! 🔫`
  });
}

async function handleBountyComplete(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the lead hunter can mark bounties complete.', ephemeral: true });
  }
  
  const bountyInfo = BOUNTY_CONFIG.bountyTypes[session.bountyType];
  const cash = Math.floor(Math.random() * (bountyInfo.payout.max - bountyInfo.payout.min + 1)) + bountyInfo.payout.min;
  const gold = bountyInfo.gold;
  
  session.bountiesCompleted++;
  session.totalCash += cash;
  session.totalGold += gold;
  
  const embed = await createRecruitingEmbed(session, interaction.guild);
  embed.setTitle('🎯 BOUNTY HUNT - IN PROGRESS');
  embed.setColor(0x00FF00);
  
  const components = createRecruitingComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
  
  await recordCompletion(session, client);
  
  await interaction.channel.send({
    content: `💰 **BOUNTY CAUGHT!** #${session.bountiesCompleted}\n+$${cash} | +${gold}g\nTotal: $${session.totalCash.toLocaleString()} | ${session.totalGold.toFixed(2)}g`,
    allowedMentions: { parse: [] }
  });
}

async function handleBountyFailed(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the lead hunter can mark this.', ephemeral: true });
  }
  
  await interaction.channel.send({
    content: `💨 **TARGET ESCAPED!** The bounty got away... Better luck next time, hunters.`,
    allowedMentions: { parse: [] }
  });
  
  await interaction.deferUpdate();
}

async function handleCreateVoice(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the lead hunter can create voice channels.', ephemeral: true });
  }
  
  try {
    const category = interaction.guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase().includes('red dead') || c.name.toLowerCase().includes('rdo'))
    );
    
    const voiceChannel = await interaction.guild.channels.create({
      name: `🎯 Bounty - ${session.hostName}`,
      type: ChannelType.GuildVoice,
      parent: category?.id,
      userLimit: BOUNTY_CONFIG.maxPlayers,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] },
        ...session.players.map(p => ({
          id: p.userId,
          allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
        }))
      ]
    });
    
    session.voiceChannel = voiceChannel.id;
    
    const embed = await createRecruitingEmbed(session, interaction.guild);
    const components = createRecruitingComponents(sessionId, session);
    
    await interaction.update({ embeds: [embed], components });
    
    await interaction.channel.send({
      content: `🔊 Voice channel created! <#${voiceChannel.id}>`,
      allowedMentions: { parse: [] }
    });
    
  } catch (error) {
    console.error('[BOUNTY LFG] Voice channel error:', error);
    await interaction.reply({ content: '❌ Failed to create voice channel.', ephemeral: true });
  }
}

async function handleEndSession(interaction, session, sessionId, client) {
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the lead hunter can end the session.', ephemeral: true });
  }
  
  session.status = 'completed';
  
  await cleanupSession(session, client);
  activeSessions.delete(sessionId);
  userCooldowns.set(session.host, Date.now());
  
  const embed = new EmbedBuilder()
    .setTitle('✅ BOUNTY SESSION COMPLETE')
    .setDescription(`
**Lead Hunter:** ${session.hostName}
**Bounties Caught:** ${session.bountiesCompleted}
**Cash Earned:** $${session.totalCash.toLocaleString()}
**Gold Earned:** ${session.totalGold.toFixed(2)}
**Hunters:** ${session.players.map(p => p.name).join(', ')}
    `)
    .setColor(0x00FF00)
    .setFooter({ text: 'Thanks for using the Bounty Hunter LFG!' })
    .setTimestamp();
  
  await interaction.update({ embeds: [embed], components: [] });
}

// ============================================
// SELECT MENU HANDLER
// ============================================

async function handleSelectMenu(interaction, client) {
  const customId = interaction.customId;
  
  if (!customId.startsWith('bounty_')) return;
  
  const parts = customId.split('_');
  const type = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    return interaction.reply({ content: '❌ Session not found.', ephemeral: true });
  }
  
  if (interaction.user.id !== session.host) {
    return interaction.reply({ content: '❌ Only the lead hunter can change settings.', ephemeral: true });
  }
  
  const value = interaction.values[0];
  
  switch (type) {
    case 'type':
      session.bountyType = value;
      session.legendaryTarget = null; // Reset target when type changes
      break;
    case 'legendary':
      session.legendaryTarget = value;
      break;
  }
  
  const embed = await createSetupEmbed(session, interaction.guild);
  const components = createSetupComponents(sessionId, session);
  
  await interaction.update({ embeds: [embed], components });
}

// ============================================
// UTILITIES
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
    }
  }
}

async function recordCompletion(session, client) {
  try {
    await client.db.query(
      `INSERT INTO bounty_completions (session_id, host_id, players, bounty_type, legendary_target, cash, gold, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [session.id, session.host, JSON.stringify(session.players.map(p => p.userId)), session.bountyType, session.legendaryTarget, session.totalCash, session.totalGold]
    );
  } catch (e) {
    console.error('[BOUNTY LFG] Record error:', e);
  }
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

async function createTables(client) {
  try {
    await client.db.query(`
      CREATE TABLE IF NOT EXISTS bounty_completions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(64),
        host_id VARCHAR(32),
        players JSONB,
        bounty_type VARCHAR(32),
        legendary_target VARCHAR(32),
        cash INTEGER DEFAULT 0,
        gold DECIMAL(10,2) DEFAULT 0,
        completed_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.error('[BOUNTY LFG] Table error:', e);
  }
}

module.exports = { initialize, createSession, createTables, BOUNTY_CONFIG };
