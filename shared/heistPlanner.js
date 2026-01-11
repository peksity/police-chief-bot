/**
 * HEIST PLANNER AI
 * Generates optimal grinding routes and heist plans
 */

const { EmbedBuilder } = require('discord.js');

class HeistPlanner {
  constructor(anthropicClient) {
    this.anthropic = anthropicClient;
    
    // GTA Online activities
    this.gtaActivities = {
      cayoPerico: { name: 'Cayo Perico Heist', time: 45, earnings: 1400000, cooldown: 48, difficulty: 'Medium', players: '1-4' },
      casinoHeist: { name: 'Diamond Casino Heist', time: 60, earnings: 2500000, cooldown: 0, difficulty: 'Hard', players: '2-4' },
      payphone: { name: 'Payphone Hits', time: 8, earnings: 85000, cooldown: 20, difficulty: 'Easy', players: '1' },
      securityContract: { name: 'Security Contracts', time: 10, earnings: 60000, cooldown: 5, difficulty: 'Easy', players: '1-4' },
      vehicleCargo: { name: 'Vehicle Cargo', time: 15, earnings: 80000, cooldown: 20, difficulty: 'Easy', players: '1-4' },
      bunkerSale: { name: 'Bunker Sale', time: 15, earnings: 210000, cooldown: 140, difficulty: 'Medium', players: '1-4' },
      nightclubSale: { name: 'Nightclub Sale', time: 10, earnings: 500000, cooldown: 960, difficulty: 'Easy', players: '1' },
      autoshop: { name: 'Auto Shop Contracts', time: 20, earnings: 170000, cooldown: 0, difficulty: 'Medium', players: '1-4' }
    };

    // RDO activities
    this.rdoActivities = {
      legendaryBounty: { name: 'Legendary Bounty', time: 15, earnings: 225, cooldown: 48, difficulty: 'Medium', gold: 0.48 },
      traderDelivery: { name: 'Trader Delivery', time: 15, earnings: 625, cooldown: 200, difficulty: 'Medium' },
      moonshine: { name: 'Moonshine Delivery', time: 10, earnings: 247, cooldown: 48, difficulty: 'Easy' },
      collectibles: { name: 'Collector Route', time: 60, earnings: 1000, cooldown: 1440, difficulty: 'Easy' },
      callToArms: { name: 'Call to Arms', time: 30, earnings: 400, cooldown: 0, difficulty: 'Hard', gold: 1.0 }
    };
  }

  calculateMPH(activity) {
    return Math.round((activity.earnings / activity.time) * 60);
  }

  async generatePlan(timeAvailable, playerCount, game = 'gta') {
    const activities = game === 'gta' ? this.gtaActivities : this.rdoActivities;
    
    // Sort by money per hour
    const sorted = Object.values(activities)
      .filter(a => a.time <= timeAvailable)
      .sort((a, b) => this.calculateMPH(b) - this.calculateMPH(a));

    let remainingTime = timeAvailable;
    const schedule = [];
    let totalEarnings = 0;

    for (const activity of sorted) {
      if (activity.time <= remainingTime) {
        schedule.push({
          name: activity.name,
          time: activity.time,
          earnings: activity.earnings,
          mph: this.calculateMPH(activity)
        });
        remainingTime -= activity.time;
        totalEarnings += activity.earnings;
        if (remainingTime < 10) break;
      }
    }

    return { schedule, totalTime: timeAvailable - remainingTime, totalEarnings };
  }

  async generateAIPlan(message, timeAvailable, playerCount, preferences = '') {
    try {
      const prompt = `You are a GTA Online and Red Dead Online grinding expert. Create an optimal grinding plan.

Time Available: ${timeAvailable} minutes
Players: ${playerCount}
Preferences: ${preferences || 'None specified'}

Create a detailed grinding schedule with:
1. Specific activities in order
2. Time for each activity
3. Expected earnings
4. Total earnings
5. Tips for efficiency

Keep it concise but helpful. Use exact numbers.`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('[HEIST PLANNER] AI error:', error.message);
      return null;
    }
  }

  createPlanEmbed(plan, timeAvailable, game) {
    const currencySymbol = game === 'gta' ? '$' : '$';
    
    let scheduleText = '';
    plan.schedule.forEach((item, i) => {
      scheduleText += `**${i + 1}. ${item.name}**\n`;
      scheduleText += `⏱️ ${item.time}min | 💰 ${currencySymbol}${item.earnings.toLocaleString()} | 📈 ${currencySymbol}${item.mph.toLocaleString()}/hr\n\n`;
    });

    return new EmbedBuilder()
      .setTitle(`📋 ${game.toUpperCase()} Grinding Plan`)
      .setDescription(`**Time Budget:** ${timeAvailable} minutes\n**Planned Time:** ${plan.totalTime} minutes`)
      .addFields(
        { name: '📅 Schedule', value: scheduleText || 'No activities fit your time window.' },
        { name: '💰 Total Earnings', value: `${currencySymbol}${plan.totalEarnings.toLocaleString()}`, inline: true },
        { name: '📈 Average $/hr', value: `${currencySymbol}${Math.round((plan.totalEarnings / plan.totalTime) * 60).toLocaleString()}`, inline: true }
      )
      .setColor(game === 'gta' ? 0x00FF00 : 0x8B4513)
      .setFooter({ text: 'Optimal grinding route' })
      .setTimestamp();
  }
}

module.exports = { HeistPlanner };
