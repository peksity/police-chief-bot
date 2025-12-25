d}`)
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
    new ButtonBuilder().setCustomId(`bounty_join_${sessionId}`).setLabel('Join').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bounty_leave_${sessionId}`).setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bounty_voice_${sessionId}`).setLabel('Voice').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bounty_ready_${sessionId}`).setLabel('Start').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bounty_complete_${sessionId}`).setLabel('Done').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bounty_end_${sessionId}`).setLabel('End').setStyle(ButtonStyle.Danger)
  );
  const components = [row1, row2];
  
  if (session.players.length > 1) {
    const opts = session.players.filter(p => p.userId !== session.userId).map(p => ({ label: `Kick ${p.psn}`, value: p.userId }));
    if (opts.length) components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bounty_kick_${sessionId}`).setPlaceholder('👢 Kick').addOptions(opts)));
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

async function createTables() {}
module.exports = { initialize, createSession, createTables };
