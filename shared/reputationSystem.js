/**
 * REPUTATION WEB SYSTEM
 * Track who plays with who, trust scores, and relationship networks
 */

const { EmbedBuilder } = require('discord.js');

class ReputationSystem {
  constructor(pool) {
    this.pool = pool;
  }

  async initialize() {
    try {
      // Player reputation table
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS reputation (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          total_sessions INT DEFAULT 0,
          successful_sessions INT DEFAULT 0,
          failed_sessions INT DEFAULT 0,
          total_earnings BIGINT DEFAULT 0,
          avg_rating DECIMAL(3,2) DEFAULT 5.00,
          total_ratings INT DEFAULT 0,
          trust_score INT DEFAULT 50,
          titles TEXT[] DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (user_id, guild_id)
        )
      `);

      // Session history (who played with who)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS session_history (
          id SERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          host_id TEXT NOT NULL,
          activity_type TEXT,
          participants TEXT[],
          earnings BIGINT DEFAULT 0,
          success BOOLEAN DEFAULT true,
          duration INT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Player connections (relationship strength)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS player_connections (
          user_id TEXT NOT NULL,
          partner_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          sessions_together INT DEFAULT 0,
          total_earnings_together BIGINT DEFAULT 0,
          last_session TIMESTAMP,
          trust_level INT DEFAULT 0,
          PRIMARY KEY (user_id, partner_id, guild_id)
        )
      `);

      // Ratings/reviews
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS player_ratings (
          id SERIAL PRIMARY KEY,
          rater_id TEXT NOT NULL,
          rated_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          rating INT CHECK (rating >= 1 AND rating <= 5),
          comment TEXT,
          session_id INT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      console.log('[REPUTATION] Database initialized');
      return true;
    } catch (error) {
      console.error('[REPUTATION] Init error:', error.message);
      return false;
    }
  }

  /**
   * Get or create player reputation
   */
  async getReputation(userId, guildId) {
    try {
      let result = await this.pool.query(
        'SELECT * FROM reputation WHERE user_id = $1 AND guild_id = $2',
        [userId, guildId]
      );

      if (result.rows.length === 0) {
        await this.pool.query(
          'INSERT INTO reputation (user_id, guild_id) VALUES ($1, $2)',
          [userId, guildId]
        );
        result = await this.pool.query(
          'SELECT * FROM reputation WHERE user_id = $1 AND guild_id = $2',
          [userId, guildId]
        );
      }

      return result.rows[0];
    } catch (error) {
      console.error('[REPUTATION] Get error:', error.message);
      return null;
    }
  }

  /**
   * Record a session
   */
  async recordSession(guildId, hostId, participants, activityType, earnings, success = true, duration = 0) {
    try {
      // Insert session
      const sessionResult = await this.pool.query(
        `INSERT INTO session_history (guild_id, host_id, activity_type, participants, earnings, success, duration)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [guildId, hostId, activityType, participants, earnings, success, duration]
      );

      const sessionId = sessionResult.rows[0].id;
      const allPlayers = [hostId, ...participants];
      const earningsPerPlayer = Math.floor(earnings / allPlayers.length);

      // Update each player's reputation
      for (const playerId of allPlayers) {
        await this.pool.query(`
          UPDATE reputation SET
            total_sessions = total_sessions + 1,
            successful_sessions = successful_sessions + $1,
            failed_sessions = failed_sessions + $2,
            total_earnings = total_earnings + $3,
            trust_score = LEAST(100, trust_score + $4)
          WHERE user_id = $5 AND guild_id = $6
        `, [
          success ? 1 : 0,
          success ? 0 : 1,
          earningsPerPlayer,
          success ? 1 : -2, // Gain 1 trust for success, lose 2 for fail
          playerId,
          guildId
        ]);

        // Ensure player exists
        await this.getReputation(playerId, guildId);
      }

      // Update connections between all players
      for (let i = 0; i < allPlayers.length; i++) {
        for (let j = i + 1; j < allPlayers.length; j++) {
          await this.updateConnection(allPlayers[i], allPlayers[j], guildId, earningsPerPlayer);
        }
      }

      return sessionId;
    } catch (error) {
      console.error('[REPUTATION] Record session error:', error.message);
      return null;
    }
  }

  /**
   * Update connection between two players
   */
  async updateConnection(userId, partnerId, guildId, earnings = 0) {
    try {
      // Update both directions
      for (const [u1, u2] of [[userId, partnerId], [partnerId, userId]]) {
        await this.pool.query(`
          INSERT INTO player_connections (user_id, partner_id, guild_id, sessions_together, total_earnings_together, last_session, trust_level)
          VALUES ($1, $2, $3, 1, $4, NOW(), 1)
          ON CONFLICT (user_id, partner_id, guild_id)
          DO UPDATE SET
            sessions_together = player_connections.sessions_together + 1,
            total_earnings_together = player_connections.total_earnings_together + $4,
            last_session = NOW(),
            trust_level = LEAST(100, player_connections.trust_level + 1)
        `, [u1, u2, guildId, earnings]);
      }
    } catch (error) {
      console.error('[REPUTATION] Update connection error:', error.message);
    }
  }

  /**
   * Rate a player
   */
  async ratePlayer(raterId, ratedId, guildId, rating, comment = '', sessionId = null) {
    try {
      if (raterId === ratedId) {
        return { success: false, message: "You can't rate yourself!" };
      }

      if (rating < 1 || rating > 5) {
        return { success: false, message: 'Rating must be 1-5!' };
      }

      // Insert rating
      await this.pool.query(
        `INSERT INTO player_ratings (rater_id, rated_id, guild_id, rating, comment, session_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [raterId, ratedId, guildId, rating, comment, sessionId]
      );

      // Update average rating
      const avgResult = await this.pool.query(
        `SELECT AVG(rating)::DECIMAL(3,2) as avg, COUNT(*) as count
         FROM player_ratings WHERE rated_id = $1 AND guild_id = $2`,
        [ratedId, guildId]
      );

      await this.pool.query(
        `UPDATE reputation SET avg_rating = $1, total_ratings = $2
         WHERE user_id = $3 AND guild_id = $4`,
        [avgResult.rows[0].avg, avgResult.rows[0].count, ratedId, guildId]
      );

      return { success: true, newAverage: avgResult.rows[0].avg };
    } catch (error) {
      console.error('[REPUTATION] Rate error:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get player's frequent partners
   */
  async getFrequentPartners(userId, guildId, limit = 5) {
    try {
      const result = await this.pool.query(
        `SELECT partner_id, sessions_together, total_earnings_together, trust_level, last_session
         FROM player_connections
         WHERE user_id = $1 AND guild_id = $2
         ORDER BY sessions_together DESC
         LIMIT $3`,
        [userId, guildId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[REPUTATION] Get partners error:', error.message);
      return [];
    }
  }

  /**
   * Get connection between two players
   */
  async getConnection(userId, partnerId, guildId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM player_connections
         WHERE user_id = $1 AND partner_id = $2 AND guild_id = $3`,
        [userId, partnerId, guildId]
      );

      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get trust title based on score
   */
  getTrustTitle(trustScore) {
    if (trustScore >= 90) return '🏆 Legendary';
    if (trustScore >= 75) return '⭐ Trusted';
    if (trustScore >= 60) return '✅ Reliable';
    if (trustScore >= 40) return '👤 Neutral';
    if (trustScore >= 25) return '⚠️ Risky';
    return '🚫 Untrusted';
  }

  /**
   * Create reputation embed
   */
  createReputationEmbed(rep, user, partners = []) {
    const successRate = rep.total_sessions > 0 
      ? Math.round((rep.successful_sessions / rep.total_sessions) * 100) 
      : 0;

    const trustTitle = this.getTrustTitle(rep.trust_score);
    const stars = '⭐'.repeat(Math.round(parseFloat(rep.avg_rating)));

    let partnersText = 'No frequent partners yet.';
    if (partners.length > 0) {
      partnersText = partners.map((p, i) => 
        `${i + 1}. <@${p.partner_id}> - ${p.sessions_together} sessions`
      ).join('\n');
    }

    return new EmbedBuilder()
      .setTitle(`📊 ${user.username}'s Reputation`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🎖️ Trust Level', value: `${trustTitle}\nScore: ${rep.trust_score}/100`, inline: true },
        { name: '⭐ Rating', value: `${stars}\n${rep.avg_rating}/5.00 (${rep.total_ratings} reviews)`, inline: true },
        { name: '📈 Stats', value: `Sessions: ${rep.total_sessions}\nSuccess Rate: ${successRate}%\nEarnings: $${parseInt(rep.total_earnings).toLocaleString()}`, inline: true },
        { name: '🤝 Frequent Partners', value: partnersText }
      )
      .setColor(rep.trust_score >= 60 ? 0x00FF00 : rep.trust_score >= 40 ? 0xFFFF00 : 0xFF0000)
      .setFooter({ text: 'Build trust by completing sessions successfully!' })
      .setTimestamp();
  }

  /**
   * Create connection embed between two players
   */
  createConnectionEmbed(connection, user1, user2) {
    if (!connection) {
      return new EmbedBuilder()
        .setTitle('🔗 No Connection')
        .setDescription(`${user1.username} and ${user2.username} haven't played together yet.`)
        .setColor(0x808080);
    }

    const trustLevel = connection.trust_level >= 50 ? '💚 Strong' : 
                       connection.trust_level >= 20 ? '💛 Growing' : '🤍 New';

    return new EmbedBuilder()
      .setTitle(`🔗 Connection: ${user1.username} & ${user2.username}`)
      .addFields(
        { name: '🎮 Sessions Together', value: `${connection.sessions_together}`, inline: true },
        { name: '💰 Total Earned Together', value: `$${parseInt(connection.total_earnings_together).toLocaleString()}`, inline: true },
        { name: '🤝 Trust Level', value: `${trustLevel} (${connection.trust_level}/100)`, inline: true },
        { name: '📅 Last Session', value: connection.last_session ? `<t:${Math.floor(new Date(connection.last_session).getTime() / 1000)}:R>` : 'Never', inline: true }
      )
      .setColor(0x00BFFF)
      .setTimestamp();
  }
}

module.exports = { ReputationSystem };
