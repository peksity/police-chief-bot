/**
 * PREDICTIVE ANALYTICS SYSTEM
 * Track user patterns and predict best times for LFG
 */

const { EmbedBuilder } = require('discord.js');

class PredictiveAnalytics {
  constructor(pool) {
    this.pool = pool;
  }

  async initialize() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_activity_patterns (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          day_of_week INT,
          hour_of_day INT,
          activity_count INT DEFAULT 0,
          lfg_count INT DEFAULT 0,
          success_count INT DEFAULT 0,
          PRIMARY KEY (user_id, guild_id, day_of_week, hour_of_day)
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS lfg_predictions (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          predicted_day INT,
          predicted_hour INT,
          confidence DECIMAL(3,2),
          last_updated TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (user_id, guild_id)
        )
      `);

      console.log('[PREDICTIVE] Database initialized');
      return true;
    } catch (error) {
      console.error('[PREDICTIVE] Init error:', error.message);
      return false;
    }
  }

  /**
   * Record user activity
   */
  async recordActivity(userId, guildId, isLFG = false, success = true) {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0-6
      const hourOfDay = now.getHours(); // 0-23

      await this.pool.query(`
        INSERT INTO user_activity_patterns (user_id, guild_id, day_of_week, hour_of_day, activity_count, lfg_count, success_count)
        VALUES ($1, $2, $3, $4, 1, $5, $6)
        ON CONFLICT (user_id, guild_id, day_of_week, hour_of_day)
        DO UPDATE SET
          activity_count = user_activity_patterns.activity_count + 1,
          lfg_count = user_activity_patterns.lfg_count + $5,
          success_count = user_activity_patterns.success_count + $6
      `, [userId, guildId, dayOfWeek, hourOfDay, isLFG ? 1 : 0, success ? 1 : 0]);

      return true;
    } catch (error) {
      console.error('[PREDICTIVE] Record error:', error.message);
      return false;
    }
  }

  /**
   * Get user's most active times
   */
  async getActiveTimes(userId, guildId, limit = 5) {
    try {
      const result = await this.pool.query(`
        SELECT day_of_week, hour_of_day, activity_count, lfg_count
        FROM user_activity_patterns
        WHERE user_id = $1 AND guild_id = $2
        ORDER BY lfg_count DESC, activity_count DESC
        LIMIT $3
      `, [userId, guildId, limit]);

      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Predict best LFG time for user
   */
  async predictBestTime(userId, guildId) {
    try {
      const patterns = await this.getActiveTimes(userId, guildId, 1);
      
      if (patterns.length === 0) {
        return null;
      }

      const best = patterns[0];
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      return {
        day: days[best.day_of_week],
        dayNum: best.day_of_week,
        hour: best.hour_of_day,
        hourFormatted: this.formatHour(best.hour_of_day),
        confidence: Math.min(100, Math.round((best.lfg_count / Math.max(1, best.activity_count)) * 100)),
        totalSessions: best.lfg_count
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get server-wide peak times
   */
  async getServerPeakTimes(guildId, limit = 5) {
    try {
      const result = await this.pool.query(`
        SELECT day_of_week, hour_of_day, SUM(lfg_count) as total_lfg
        FROM user_activity_patterns
        WHERE guild_id = $1
        GROUP BY day_of_week, hour_of_day
        ORDER BY total_lfg DESC
        LIMIT $3
      `, [guildId, limit]);

      return result.rows;
    } catch (error) {
      return [];
    }
  }

  /**
   * Format hour for display
   */
  formatHour(hour) {
    if (hour === 0) return '12:00 AM';
    if (hour === 12) return '12:00 PM';
    if (hour < 12) return `${hour}:00 AM`;
    return `${hour - 12}:00 PM`;
  }

  /**
   * Get day name
   */
  getDayName(dayNum) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayNum];
  }

  /**
   * Create prediction embed
   */
  createPredictionEmbed(prediction, user, serverPeaks = []) {
    const embed = new EmbedBuilder()
      .setTitle(`🔮 Activity Prediction for ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setColor(0x9932CC)
      .setTimestamp();

    if (prediction) {
      embed.addFields(
        { 
          name: '📊 Your Best LFG Time', 
          value: `**${prediction.day}** at **${prediction.hourFormatted}**\nBased on ${prediction.totalSessions} sessions`,
          inline: false 
        },
        { 
          name: '🎯 Confidence', 
          value: `${prediction.confidence}%`, 
          inline: true 
        }
      );
    } else {
      embed.setDescription("Not enough data yet. Keep using LFG and I'll learn your patterns!");
    }

    if (serverPeaks.length > 0) {
      const peakText = serverPeaks.slice(0, 3).map((p, i) => 
        `${i + 1}. ${this.getDayName(p.day_of_week)} ${this.formatHour(p.hour_of_day)}`
      ).join('\n');
      embed.addFields({ name: '🌐 Server Peak Times', value: peakText, inline: false });
    }

    embed.setFooter({ text: 'Based on your activity patterns' });
    return embed;
  }

  /**
   * Check if user should be notified (at their predicted time)
   */
  async shouldNotify(userId, guildId) {
    const prediction = await this.predictBestTime(userId, guildId);
    if (!prediction || prediction.confidence < 50) return false;

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    return currentDay === prediction.dayNum && currentHour === prediction.hour;
  }
}

module.exports = { PredictiveAnalytics };
