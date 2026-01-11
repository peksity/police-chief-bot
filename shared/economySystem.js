/**
 * ECONOMY SYSTEM
 * Full server economy with currency, gambling, betting, and rewards
 * 
 * Features:
 * - Server currency (Chips)
 * - Daily rewards
 * - Gambling games (slots, coinflip, blackjack, roulette)
 * - Betting on heist outcomes
 * - Leaderboards
 * - Shop system
 * - Transfer between users
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

class EconomySystem {
  constructor(pool) {
    this.pool = pool;
    this.currency = {
      name: 'Chips',
      symbol: '🪙',
      emoji: '🪙'
    };
    
    // Gambling odds
    this.slots = {
      symbols: ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '🔔', '⭐'],
      payouts: {
        '7️⃣7️⃣7️⃣': 100,  // Jackpot
        '💎💎💎': 50,
        '⭐⭐⭐': 25,
        '🔔🔔🔔': 15,
        '🍇🍇🍇': 10,
        '🍊🍊🍊': 8,
        '🍋🍋🍋': 5,
        '🍒🍒🍒': 3,
        'any_two': 1.5  // Two matching = 1.5x
      }
    };

    // Cooldowns
    this.dailyCooldowns = new Map();
    this.workCooldowns = new Map();
    this.crimeCooldowns = new Map();
  }

  /**
   * Initialize database tables
   */
  async initialize() {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS economy (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          balance BIGINT DEFAULT 1000,
          bank BIGINT DEFAULT 0,
          total_earned BIGINT DEFAULT 0,
          total_lost BIGINT DEFAULT 0,
          total_gambled BIGINT DEFAULT 0,
          biggest_win BIGINT DEFAULT 0,
          biggest_loss BIGINT DEFAULT 0,
          win_streak INT DEFAULT 0,
          current_streak INT DEFAULT 0,
          daily_streak INT DEFAULT 0,
          last_daily TIMESTAMP,
          last_work TIMESTAMP,
          last_crime TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (user_id, guild_id)
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS economy_transactions (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          type TEXT NOT NULL,
          amount BIGINT NOT NULL,
          balance_after BIGINT,
          description TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS economy_bets (
          id SERIAL PRIMARY KEY,
          guild_id TEXT NOT NULL,
          creator_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          options JSONB DEFAULT '[]',
          total_pool BIGINT DEFAULT 0,
          status TEXT DEFAULT 'open',
          winner_option INT,
          created_at TIMESTAMP DEFAULT NOW(),
          closes_at TIMESTAMP,
          resolved_at TIMESTAMP
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS economy_bet_entries (
          id SERIAL PRIMARY KEY,
          bet_id INT REFERENCES economy_bets(id),
          user_id TEXT NOT NULL,
          option_index INT NOT NULL,
          amount BIGINT NOT NULL,
          payout BIGINT DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      console.log('[ECONOMY] Database initialized');
      return true;
    } catch (error) {
      console.error('[ECONOMY] Init error:', error.message);
      return false;
    }
  }

  /**
   * Get or create user account
   */
  async getAccount(userId, guildId) {
    try {
      let result = await this.pool.query(
        'SELECT * FROM economy WHERE user_id = $1 AND guild_id = $2',
        [userId, guildId]
      );

      if (result.rows.length === 0) {
        // Create new account with starting balance
        await this.pool.query(
          `INSERT INTO economy (user_id, guild_id, balance) VALUES ($1, $2, 1000)`,
          [userId, guildId]
        );
        result = await this.pool.query(
          'SELECT * FROM economy WHERE user_id = $1 AND guild_id = $2',
          [userId, guildId]
        );
      }

      return result.rows[0];
    } catch (error) {
      console.error('[ECONOMY] Get account error:', error.message);
      return null;
    }
  }

  /**
   * Update user balance
   */
  async updateBalance(userId, guildId, amount, type = 'other', description = '') {
    try {
      const account = await this.getAccount(userId, guildId);
      const newBalance = Math.max(0, parseInt(account.balance) + amount);

      await this.pool.query(
        'UPDATE economy SET balance = $1 WHERE user_id = $2 AND guild_id = $3',
        [newBalance, userId, guildId]
      );

      // Log transaction
      await this.pool.query(
        `INSERT INTO economy_transactions (user_id, guild_id, type, amount, balance_after, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, guildId, type, amount, newBalance, description]
      );

      // Update stats
      if (amount > 0) {
        await this.pool.query(
          'UPDATE economy SET total_earned = total_earned + $1 WHERE user_id = $2 AND guild_id = $3',
          [amount, userId, guildId]
        );
      } else {
        await this.pool.query(
          'UPDATE economy SET total_lost = total_lost + $1 WHERE user_id = $2 AND guild_id = $3',
          [Math.abs(amount), userId, guildId]
        );
      }

      return newBalance;
    } catch (error) {
      console.error('[ECONOMY] Update balance error:', error.message);
      return null;
    }
  }

  /**
   * DAILY REWARD
   */
  async claimDaily(userId, guildId) {
    const account = await this.getAccount(userId, guildId);
    const now = new Date();
    const lastDaily = account.last_daily ? new Date(account.last_daily) : null;

    // Check if 24 hours have passed
    if (lastDaily) {
      const hoursSince = (now - lastDaily) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const timeLeft = 24 - hoursSince;
        const hours = Math.floor(timeLeft);
        const minutes = Math.floor((timeLeft - hours) * 60);
        return {
          success: false,
          message: `You already claimed your daily! Come back in **${hours}h ${minutes}m**`
        };
      }
    }

    // Calculate streak
    let streak = account.daily_streak || 0;
    if (lastDaily) {
      const hoursSince = (now - lastDaily) / (1000 * 60 * 60);
      if (hoursSince < 48) {
        streak += 1;
      } else {
        streak = 1; // Reset streak
      }
    } else {
      streak = 1;
    }

    // Calculate reward (base + streak bonus)
    const baseReward = 500;
    const streakBonus = Math.min(streak * 50, 500); // Max 500 bonus
    const totalReward = baseReward + streakBonus;

    // Update database
    await this.pool.query(
      `UPDATE economy SET 
        balance = balance + $1, 
        last_daily = NOW(), 
        daily_streak = $2,
        total_earned = total_earned + $1
       WHERE user_id = $3 AND guild_id = $4`,
      [totalReward, streak, userId, guildId]
    );

    return {
      success: true,
      reward: totalReward,
      streak: streak,
      streakBonus: streakBonus
    };
  }

  /**
   * WORK - Earn money with cooldown
   */
  async work(userId, guildId) {
    const cooldownKey = `${userId}-${guildId}`;
    const lastWork = this.workCooldowns.get(cooldownKey);
    const now = Date.now();

    if (lastWork && (now - lastWork) < 30 * 60 * 1000) { // 30 min cooldown
      const timeLeft = Math.ceil((30 * 60 * 1000 - (now - lastWork)) / 60000);
      return {
        success: false,
        message: `You're tired! Rest for **${timeLeft} minutes** before working again.`
      };
    }

    const jobs = [
      { name: 'drove the getaway car', min: 100, max: 300 },
      { name: 'hacked a security system', min: 150, max: 400 },
      { name: 'delivered contraband', min: 200, max: 500 },
      { name: 'scouted a heist location', min: 250, max: 600 },
      { name: 'sold some "merchandise"', min: 100, max: 350 },
      { name: 'completed a VIP mission', min: 300, max: 700 },
      { name: 'ran a cargo delivery', min: 200, max: 550 }
    ];

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const earnings = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;

    await this.updateBalance(userId, guildId, earnings, 'work', job.name);
    this.workCooldowns.set(cooldownKey, now);

    return {
      success: true,
      job: job.name,
      earnings: earnings
    };
  }

  /**
   * CRIME - High risk, high reward
   */
  async crime(userId, guildId) {
    const cooldownKey = `${userId}-${guildId}`;
    const lastCrime = this.crimeCooldowns.get(cooldownKey);
    const now = Date.now();

    if (lastCrime && (now - lastCrime) < 60 * 60 * 1000) { // 1 hour cooldown
      const timeLeft = Math.ceil((60 * 60 * 1000 - (now - lastCrime)) / 60000);
      return {
        success: false,
        message: `Lay low for **${timeLeft} minutes**. The heat is on!`
      };
    }

    const crimes = [
      { name: 'robbed a convenience store', min: 500, max: 1500, successRate: 0.6 },
      { name: 'hit a jewelry store', min: 1000, max: 3000, successRate: 0.4 },
      { name: 'stole a car for export', min: 300, max: 800, successRate: 0.7 },
      { name: 'raided a drug stash', min: 800, max: 2000, successRate: 0.5 },
      { name: 'hacked an ATM', min: 400, max: 1200, successRate: 0.65 }
    ];

    const crime = crimes[Math.floor(Math.random() * crimes.length)];
    const success = Math.random() < crime.successRate;

    this.crimeCooldowns.set(cooldownKey, now);

    if (success) {
      const earnings = Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min;
      await this.updateBalance(userId, guildId, earnings, 'crime', crime.name);
      return {
        success: true,
        crime: crime.name,
        earnings: earnings,
        caught: false
      };
    } else {
      // Got caught - lose some money
      const account = await this.getAccount(userId, guildId);
      const fine = Math.min(Math.floor(account.balance * 0.1), 500); // 10% or 500 max
      if (fine > 0) {
        await this.updateBalance(userId, guildId, -fine, 'crime_fail', 'Got caught');
      }
      return {
        success: true,
        crime: crime.name,
        caught: true,
        fine: fine
      };
    }
  }

  /**
   * SLOTS GAME
   */
  async playSlots(userId, guildId, bet) {
    const account = await this.getAccount(userId, guildId);
    
    if (bet < 10) {
      return { success: false, message: 'Minimum bet is 10 chips!' };
    }
    
    if (parseInt(account.balance) < bet) {
      return { success: false, message: "You don't have enough chips!" };
    }

    // Deduct bet
    await this.updateBalance(userId, guildId, -bet, 'slots_bet', 'Slots bet');

    // Spin the slots
    const result = [
      this.slots.symbols[Math.floor(Math.random() * this.slots.symbols.length)],
      this.slots.symbols[Math.floor(Math.random() * this.slots.symbols.length)],
      this.slots.symbols[Math.floor(Math.random() * this.slots.symbols.length)]
    ];

    const resultStr = result.join('');
    let multiplier = 0;
    let winType = '';

    // Check for wins
    if (result[0] === result[1] && result[1] === result[2]) {
      // Three of a kind
      const key = resultStr;
      multiplier = this.slots.payouts[key] || 3;
      winType = result[0] === '7️⃣' ? 'JACKPOT!!!' : 'Three of a kind!';
    } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
      // Two matching
      multiplier = 1.5;
      winType = 'Two matching!';
    }

    let winnings = 0;
    if (multiplier > 0) {
      winnings = Math.floor(bet * multiplier);
      await this.updateBalance(userId, guildId, winnings, 'slots_win', winType);
      
      // Update biggest win if applicable
      if (winnings > (account.biggest_win || 0)) {
        await this.pool.query(
          'UPDATE economy SET biggest_win = $1 WHERE user_id = $2 AND guild_id = $3',
          [winnings, userId, guildId]
        );
      }
    }

    // Update gambling stats
    await this.pool.query(
      'UPDATE economy SET total_gambled = total_gambled + $1 WHERE user_id = $2 AND guild_id = $3',
      [bet, userId, guildId]
    );

    const profit = winnings - bet;

    return {
      success: true,
      result: result,
      bet: bet,
      multiplier: multiplier,
      winnings: winnings,
      profit: profit,
      winType: winType
    };
  }

  /**
   * COINFLIP GAME
   */
  async coinflip(userId, guildId, bet, choice) {
    const account = await this.getAccount(userId, guildId);
    
    if (bet < 10) {
      return { success: false, message: 'Minimum bet is 10 chips!' };
    }
    
    if (parseInt(account.balance) < bet) {
      return { success: false, message: "You don't have enough chips!" };
    }

    const validChoices = ['heads', 'tails', 'h', 't'];
    if (!validChoices.includes(choice.toLowerCase())) {
      return { success: false, message: 'Choose heads or tails!' };
    }

    const userChoice = choice.toLowerCase().startsWith('h') ? 'heads' : 'tails';
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = userChoice === result;

    if (won) {
      const winnings = bet * 2;
      await this.updateBalance(userId, guildId, bet, 'coinflip_win', 'Coinflip win');
      return {
        success: true,
        won: true,
        choice: userChoice,
        result: result,
        winnings: winnings,
        profit: bet
      };
    } else {
      await this.updateBalance(userId, guildId, -bet, 'coinflip_loss', 'Coinflip loss');
      return {
        success: true,
        won: false,
        choice: userChoice,
        result: result,
        loss: bet
      };
    }
  }

  /**
   * BLACKJACK GAME (Simplified)
   */
  async blackjack(userId, guildId, bet) {
    const account = await this.getAccount(userId, guildId);
    
    if (bet < 10) {
      return { success: false, message: 'Minimum bet is 10 chips!' };
    }
    
    if (parseInt(account.balance) < bet) {
      return { success: false, message: "You don't have enough chips!" };
    }

    // Deduct bet
    await this.updateBalance(userId, guildId, -bet, 'blackjack_bet', 'Blackjack bet');

    const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['♠️', '♥️', '♦️', '♣️'];

    const drawCard = () => {
      const card = cards[Math.floor(Math.random() * cards.length)];
      const suit = suits[Math.floor(Math.random() * suits.length)];
      return { card, suit, display: `${card}${suit}` };
    };

    const calculateHand = (hand) => {
      let total = 0;
      let aces = 0;
      
      for (const c of hand) {
        if (c.card === 'A') {
          aces++;
          total += 11;
        } else if (['K', 'Q', 'J'].includes(c.card)) {
          total += 10;
        } else {
          total += parseInt(c.card);
        }
      }
      
      while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
      }
      
      return total;
    };

    // Deal initial hands
    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];

    // Simple auto-play for now (player stands on 17+)
    while (calculateHand(playerHand) < 17) {
      playerHand.push(drawCard());
    }

    const playerTotal = calculateHand(playerHand);

    // Dealer plays (hits on 16 or less)
    while (calculateHand(dealerHand) < 17) {
      dealerHand.push(drawCard());
    }

    const dealerTotal = calculateHand(dealerHand);

    // Determine winner
    let won = false;
    let push = false;
    let blackjack = false;

    if (playerTotal > 21) {
      won = false; // Bust
    } else if (dealerTotal > 21) {
      won = true; // Dealer bust
    } else if (playerTotal === 21 && playerHand.length === 2) {
      blackjack = true;
      won = true;
    } else if (playerTotal > dealerTotal) {
      won = true;
    } else if (playerTotal === dealerTotal) {
      push = true;
    }

    let winnings = 0;
    if (push) {
      // Return bet
      await this.updateBalance(userId, guildId, bet, 'blackjack_push', 'Blackjack push');
      winnings = bet;
    } else if (won) {
      const multiplier = blackjack ? 2.5 : 2;
      winnings = Math.floor(bet * multiplier);
      await this.updateBalance(userId, guildId, winnings, 'blackjack_win', blackjack ? 'Blackjack!' : 'Blackjack win');
    }

    return {
      success: true,
      playerHand: playerHand.map(c => c.display),
      dealerHand: dealerHand.map(c => c.display),
      playerTotal,
      dealerTotal,
      won,
      push,
      blackjack,
      bet,
      winnings,
      profit: winnings - bet
    };
  }

  /**
   * ROULETTE GAME
   */
  async roulette(userId, guildId, bet, choice) {
    const account = await this.getAccount(userId, guildId);
    
    if (bet < 10) {
      return { success: false, message: 'Minimum bet is 10 chips!' };
    }
    
    if (parseInt(account.balance) < bet) {
      return { success: false, message: "You don't have enough chips!" };
    }

    // Parse choice
    const choiceLower = choice.toLowerCase();
    let betType = '';
    let multiplier = 0;
    let checkWin = () => false;

    const result = Math.floor(Math.random() * 37); // 0-36
    const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(result);
    const isBlack = result !== 0 && !isRed;

    if (choiceLower === 'red') {
      betType = 'Red';
      multiplier = 2;
      checkWin = () => isRed;
    } else if (choiceLower === 'black') {
      betType = 'Black';
      multiplier = 2;
      checkWin = () => isBlack;
    } else if (choiceLower === 'green' || choiceLower === '0') {
      betType = 'Green (0)';
      multiplier = 36;
      checkWin = () => result === 0;
    } else if (choiceLower === 'odd') {
      betType = 'Odd';
      multiplier = 2;
      checkWin = () => result !== 0 && result % 2 === 1;
    } else if (choiceLower === 'even') {
      betType = 'Even';
      multiplier = 2;
      checkWin = () => result !== 0 && result % 2 === 0;
    } else if (!isNaN(parseInt(choiceLower))) {
      const num = parseInt(choiceLower);
      if (num >= 0 && num <= 36) {
        betType = `Number ${num}`;
        multiplier = 36;
        checkWin = () => result === num;
      } else {
        return { success: false, message: 'Pick a number 0-36, red, black, odd, or even!' };
      }
    } else {
      return { success: false, message: 'Pick a number 0-36, red, black, green, odd, or even!' };
    }

    // Deduct bet
    await this.updateBalance(userId, guildId, -bet, 'roulette_bet', 'Roulette bet');

    const won = checkWin();
    let winnings = 0;

    if (won) {
      winnings = bet * multiplier;
      await this.updateBalance(userId, guildId, winnings, 'roulette_win', `Roulette - ${betType}`);
    }

    const color = result === 0 ? '🟢' : (isRed ? '🔴' : '⚫');

    return {
      success: true,
      result: result,
      color: color,
      betType: betType,
      won: won,
      bet: bet,
      multiplier: won ? multiplier : 0,
      winnings: winnings,
      profit: winnings - bet
    };
  }

  /**
   * TRANSFER CHIPS
   */
  async transfer(fromUserId, toUserId, guildId, amount) {
    if (fromUserId === toUserId) {
      return { success: false, message: "You can't transfer to yourself!" };
    }

    if (amount < 1) {
      return { success: false, message: 'Amount must be at least 1!' };
    }

    const fromAccount = await this.getAccount(fromUserId, guildId);
    
    if (parseInt(fromAccount.balance) < amount) {
      return { success: false, message: "You don't have enough chips!" };
    }

    await this.updateBalance(fromUserId, guildId, -amount, 'transfer_out', `Transfer to ${toUserId}`);
    await this.updateBalance(toUserId, guildId, amount, 'transfer_in', `Transfer from ${fromUserId}`);

    return {
      success: true,
      amount: amount
    };
  }

  /**
   * GET LEADERBOARD
   */
  async getLeaderboard(guildId, type = 'balance', limit = 10) {
    try {
      let orderBy = 'balance';
      if (type === 'earned') orderBy = 'total_earned';
      if (type === 'gambled') orderBy = 'total_gambled';

      const result = await this.pool.query(
        `SELECT user_id, balance, bank, total_earned, total_gambled, biggest_win
         FROM economy 
         WHERE guild_id = $1 
         ORDER BY ${orderBy} DESC 
         LIMIT $2`,
        [guildId, limit]
      );

      return result.rows;
    } catch (error) {
      console.error('[ECONOMY] Leaderboard error:', error.message);
      return [];
    }
  }

  /**
   * CREATE EMBED HELPERS
   */
  createBalanceEmbed(account, user) {
    return new EmbedBuilder()
      .setTitle(`${this.currency.emoji} ${user.username}'s Wallet`)
      .addFields(
        { name: '💵 Cash', value: `${this.currency.symbol} ${parseInt(account.balance).toLocaleString()}`, inline: true },
        { name: '🏦 Bank', value: `${this.currency.symbol} ${parseInt(account.bank).toLocaleString()}`, inline: true },
        { name: '💰 Net Worth', value: `${this.currency.symbol} ${(parseInt(account.balance) + parseInt(account.bank)).toLocaleString()}`, inline: true },
        { name: '📈 Total Earned', value: `${this.currency.symbol} ${parseInt(account.total_earned).toLocaleString()}`, inline: true },
        { name: '🎰 Total Gambled', value: `${this.currency.symbol} ${parseInt(account.total_gambled).toLocaleString()}`, inline: true },
        { name: '🏆 Biggest Win', value: `${this.currency.symbol} ${parseInt(account.biggest_win).toLocaleString()}`, inline: true }
      )
      .setColor(0xFFD700)
      .setThumbnail(user.displayAvatarURL({ dynamic: true }))
      .setTimestamp();
  }

  createSlotsEmbed(result, user) {
    const slotDisplay = `
    ╔═══════════╗
    ║ ${result.result[0]} │ ${result.result[1]} │ ${result.result[2]} ║
    ╚═══════════╝`;

    const embed = new EmbedBuilder()
      .setTitle('🎰 Slot Machine')
      .setDescription(`${slotDisplay}`)
      .addFields(
        { name: 'Bet', value: `${this.currency.symbol} ${result.bet.toLocaleString()}`, inline: true },
        { name: 'Multiplier', value: result.multiplier > 0 ? `${result.multiplier}x` : '0x', inline: true },
        { name: result.profit >= 0 ? '💰 Profit' : '📉 Loss', value: `${this.currency.symbol} ${Math.abs(result.profit).toLocaleString()}`, inline: true }
      )
      .setFooter({ text: user.username })
      .setTimestamp();

    if (result.profit > 0) {
      embed.setColor(0x00FF00);
      if (result.winType) embed.addFields({ name: '🎉 Result', value: result.winType, inline: false });
    } else {
      embed.setColor(0xFF0000);
    }

    return embed;
  }

  createLeaderboardEmbed(leaderboard, guild, type = 'balance') {
    const titles = {
      balance: '💰 Richest Players',
      earned: '📈 Top Earners',
      gambled: '🎰 Biggest Gamblers'
    };

    let description = '';
    leaderboard.forEach((entry, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const value = type === 'balance' ? entry.balance : type === 'earned' ? entry.total_earned : entry.total_gambled;
      description += `${medal} <@${entry.user_id}> - ${this.currency.symbol} ${parseInt(value).toLocaleString()}\n`;
    });

    return new EmbedBuilder()
      .setTitle(titles[type] || '💰 Leaderboard')
      .setDescription(description || 'No data yet!')
      .setColor(0xFFD700)
      .setFooter({ text: guild.name })
      .setTimestamp();
  }
}

module.exports = { EconomySystem };
