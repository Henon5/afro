const Bot = require('../models/Bot');
const RoomPool = require('../models/RoomPool');
const mongoose = require('mongoose');

// Store IO instance reference to avoid circular dependency
let ioInstance = null;

/**
 * Set the Socket.IO instance for bot events
 * Called from server.js after initialization
 */
function setIO(io) {
  ioInstance = io;
}

/**
 * Get the Socket.IO instance
 */
function getIO() {
  return ioInstance;
}

module.exports.setIO = setIO;
module.exports.getIO = getIO;

// BOT SPEED CONFIGURATION: 2 second reaction time
// Bots automatically mark their cards when a number is called
const BOT_REACTION_TIME_MS = 2000; // 2 seconds

// Scheduled job state
let botResetIntervalId = null;

const botNames = [
  'Abebe', 'Abel', 'Abdi', 'Alem', 'Amanuel',
  'Amare', 'Amsalu', 'Andualem', 'Araya', 'Assefa',
  'Bekele', 'Belay', 'Berhanu', 'Binyam', 'Biruk',
  'Dagim', 'Daniel', 'Dawit', 'Desta', 'Elias',
  'Ermias', 'Eyasu', 'Ezra', 'Fikru', 'Girma',
  'Habtamu', 'Haile', 'Henok', 'Ibsa', 'Kaleab',
  'Kebede', 'Lema', 'Melaku', 'Mekonnen', 'Meron',
  'Mulugeta', 'Natnael', 'Negash', 'Robel', 'Samson',
  'Sisay', 'Tadesse', 'Tamirat', 'Tewodros', 'Tolosa',
  'Worku', 'Yakob', 'Yared', 'Yohannes', 'Zerihun'
];

/**
 * Initialize 50 bots with unique names, telegram IDs, and pre-generated bingo cards
 */
async function initializeBots() {
  try {
    const existingBots = await Bot.countDocuments();
    
    if (existingBots >= 50) {
      console.log(`✅ Bots already initialized (${existingBots} bots found)`);
      // Ensure all existing bots have cards generated
      await ensureAllBotsHaveCards();
      return;
    }

    const botsToCreate = [];
    
    for (let i = 0; i < botNames.length; i++) {
      const name = botNames[i];
      const telegramId = `bot_${1000000000 + i}`; // Unique bot Telegram IDs
      
      // Check if bot already exists
      const existingBot = await Bot.findOne({ $or: [{ name }, { telegramId }] });
      
      if (!existingBot) {
        const botData = {
          name,
          telegramId,
          balance: 1000,
          difficulty: i < 15 ? 'easy' : (i < 35 ? 'medium' : 'hard'),
          isActive: true
        };
        
        // Create temporary bot instance to generate card
        const tempBot = new Bot(botData);
        tempBot.generateCard();
        
        botsToCreate.push({
          ...botData,
          cardGrid: tempBot.cardGrid,
          markedState: tempBot.markedState
        });
      }
    }

    if (botsToCreate.length > 0) {
      await Bot.insertMany(botsToCreate);
      console.log(`✅ Created ${botsToCreate.length} bots with pre-generated bingo cards`);
    } else {
      console.log('✅ All bots already exist');
    }
  } catch (error) {
    console.error('❌ Error initializing bots:', error.message);
    throw error;
  }
}

/**
 * Ensure all existing bots have bingo cards generated
 */
async function ensureAllBotsHaveCards() {
  try {
    const botsWithoutCards = await Bot.find({
      $or: [
        { cardGrid: { $exists: false } },
        { cardGrid: { $size: 0 } },
        { cardGrid: [[0]] } // Check for empty/default grid
      ]
    }).limit(10);
    
    if (botsWithoutCards.length > 0) {
      console.log(`🔄 Generating cards for ${botsWithoutCards.length} bots...`);
      
      for (const bot of botsWithoutCards) {
        bot.generateCard();
        await bot.save();
      }
      
      console.log(`✅ Generated cards for ${botsWithoutCards.length} bots`);
    }
  } catch (error) {
    console.error('❌ Error ensuring bot cards:', error.message);
  }
}

/**
 * Get all active bots
 */
async function getActiveBots() {
  return await Bot.find({ isActive: true });
}

/**
 * Get a random bot for game participation
 */
async function getRandomBot() {
  const bots = await Bot.find({ isActive: true, balance: { $gte: 10 } });
  if (bots.length === 0) return null;
  return bots[Math.floor(Math.random() * bots.length)];
}

/**
 * Simulate bot playing bingo - FAIR PLAY (no advantage)
 * @param {Object} gameSession - The game session
 * @param {Object} bot - The bot player (from database with cardGrid and markedState)
 */
function simulateBotMove(gameSession, bot) {
  const playerIndex = gameSession.players.findIndex(p => p.user === bot.telegramId.toString());
  if (playerIndex === -1) return null;

  const player = gameSession.players[playerIndex];
  const { cardGrid, markedState } = player;
  const calledSet = new Set(gameSession.calledNumbers);

  // Find all valid marks (called numbers that aren't marked yet, excluding free space)
  const validMarks = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) continue; // Skip free space
      const num = cardGrid[row][col];
      if (num !== 0 && calledSet.has(num) && !markedState[row][col]) {
        validMarks.push({ row, col, num });
      }
    }
  }

  if (validMarks.length === 0) return null;

  // FAIR PLAY: All bots use random selection like a human player
  // No difficulty-based strategy - bots play exactly like humans
  const selectedMark = validMarks[Math.floor(Math.random() * validMarks.length)];

  // Bots react within 2 seconds and automatically mark
  console.log(`⚡ Bot ${bot.name} reacting in ${BOT_REACTION_TIME_MS}ms...`);

  return selectedMark;
}

/**
 * Get bot reaction time in milliseconds
 */
function getBotReactionTime() {
  return BOT_REACTION_TIME_MS;
}

/**
 * Build the shared game-over payload for the frontend.
 * This ensures bot wins redirect the player back to the lobby.
 */
function buildGameOverPayload({ sessionId, winner, winnerName, isBot, pattern, winnings, roomAmount, message, redirectTo = 'lobby' }) {
  return {
    sessionId,
    winner: winner || winnerName || 'Bot',
    winnerName: winnerName || winner || 'Bot',
    isBot: Boolean(isBot),
    pattern,
    winnings,
    roomAmount,
    message: message || (isBot ? 'Bot won the game' : 'Player won the game'),
    redirectTo
  };
}

/**
 * Find a strategic mark that helps complete a pattern
 */
function findStrategicMark(validMarks, markedState) {
  // Simple strategy: prefer marks in rows/columns with more marks
  const scores = validMarks.map(mark => {
    const rowMarks = markedState[mark.row].filter(Boolean).length;
    const colMarks = markedState.reduce((sum, row) => sum + (row[mark.col] ? 1 : 0), 0);
    return { ...mark, score: rowMarks + colMarks };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0];
}

/**
 * Find the best strategic mark for hard difficulty
 */
function findBestStrategicMark(validMarks, markedState, calledSet, cardGrid) {
  const scores = validMarks.map(mark => {
    let score = 0;
    
    // Count marks in row
    const rowMarks = markedState[mark.row].filter(Boolean).length;
    score += rowMarks * 2;
    
    // Count marks in column
    const colMarks = markedState.reduce((sum, row) => sum + (row[mark.col] ? 1 : 0), 0);
    score += colMarks * 2;
    
    // Check diagonals
    if (mark.row === mark.col) {
      const diagMarks = [0, 1, 2, 3, 4].filter(i => markedState[i][i]).length;
      score += diagMarks * 3;
    }
    if (mark.row + mark.col === 4) {
      const antiDiagMarks = [0, 1, 2, 3, 4].filter(i => markedState[i][4-i]).length;
      score += antiDiagMarks * 3;
    }

    // Bonus for being close to winning
    if (rowMarks >= 3 || colMarks >= 3) score += 10;

    return { ...mark, score };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0];
}

/**
 * Check if bot has a winning pattern
 */
function checkBotWin(gameSession, bot) {
  const playerIndex = gameSession.players.findIndex(p => p.user === bot.telegramId);
  if (playerIndex === -1) return { win: false };
  
  return gameSession.checkWin(playerIndex);
}

/**
 * Process bot moves in the game session with improved error handling and card validation
 * This function is called after every callNumber() execution to activate bot play logic
 * @param {Object} gameSession - The game session
 * @param {number} calledNumber - The number that was just called
 */
async function processBotMoves(gameSession, calledNumber) {
  const botPlayers = gameSession.players.filter(p => p.isBot);
  
  if (botPlayers.length === 0) return null; // No bots to process
  
  console.log(`🤖 Processing ${botPlayers.length} bots for number ${calledNumber}...`);
  
  for (const botPlayer of botPlayers) {
    // Use telegramId (string) directly for lookup - DO NOT cast to ObjectId
    const bot = await Bot.findOne({ telegramId: botPlayer.user });
    if (!bot) {
      console.warn(`⚠️ Bot not found in DB: ${botPlayer.user}`);
      continue;
    }

    // Validate bot has a valid card before playing
    if (!bot.cardGrid || !bot.cardGrid.length || bot.cardGrid[0].length === 0) {
      console.warn(`⚠️ Bot ${bot.name} has no valid card, generating one...`);
      bot.generateCard();
      await bot.save();
      // Update player's card in session - Compare as strings
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId.toString());
      if (botIndex !== -1) {
        gameSession.players[botIndex].cardGrid = bot.cardGrid;
        gameSession.players[botIndex].markedState = bot.markedState;
      }
    }

    // Simulate bot reaction with 2 second delay
    await new Promise(resolve => setTimeout(resolve, BOT_REACTION_TIME_MS));
    
    // THE TRIGGER: Call simulateBotMove() for this bot
    const move = simulateBotMove(gameSession, bot);
    if (move) {
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId.toString());
      if (botIndex !== -1) {
        // THE MARK: Update marked state in game session
        gameSession.players[botIndex].markedState[move.row][move.col] = true;
        
        console.log(`✅ Bot ${bot.name} marked position [${move.row},${move.col}] = ${move.num}`);
        
        // CRITICAL FIX: Save the game session to persist the marked state
        await gameSession.save();
        
        // Reload the game session to ensure we have the latest state
        const GameSession = require('../models/GameSession');
        const freshSession = await GameSession.findById(gameSession._id).select('players calledNumbers gameStatus');
        
        // THE WIN CHECK: Run checkWin() on fresh session data
        const botWinResult = freshSession.checkWin(botIndex);
        if (botWinResult.win) {
          // Bot wins - handle payout sequence
          console.log(`🏆 BOT WINNER: ${bot.name} with pattern: ${botWinResult.pattern}!`);
          return { winner: bot, botIndex, winResult: botWinResult };
        }
      }
    }
  }
  
  return null; // No winner yet
}

/**
 * Handle bot winning the game - THE PAYOUT
 * Awards currentPool to the winning bot and stops the game
 * @param {Object} gameSession - The game session
 * @param {Object} winningBot - The winning bot
 * @param {number} playerIndex - Index of bot in players array
 * @param {Object} winResult - Win result object with pattern
 */
async function handleBotWin(gameSession, winningBot, playerIndex, winResult) {
  const roomAmount = gameSession.roomAmount;
  
  console.log('\\n' + '='.repeat(60));
  console.log('🤖 [BOT WIN] Bot has won the game!');
  console.log('='.repeat(60));
  console.log('🤖 Bot ID:', winningBot.telegramId);
  console.log('🤖 Bot Name:', winningBot.name);
  console.log('🎮 Room Amount:', roomAmount, 'ETB');
  console.log('🎯 Winning Pattern:', winResult.pattern);
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.log('='.repeat(60));
  
  // Get the room pool with current prize value BEFORE resetting
  const roomPool = await RoomPool.findOne({ roomAmount: gameSession.roomAmount });
  
  if (!roomPool) {
    console.error('❌ [BOT WIN] Room pool not found for room:', roomAmount);
    return;
  }
  
  const winnings = roomPool.currentPool + (roomPool.houseTotal || 0);
  
  console.log('\\n💰 [PAYOUT CALCULATION]');
  console.log('   Total Players in Game:', gameSession.players.length);
  console.log('   Entry Fee per Player:', roomAmount, 'ETB');
  console.log('   Total Pool Generated:', roomPool.currentPool, 'ETB');
  console.log('   House Total (15%):', roomPool.houseTotal || 0, 'ETB');
  console.log('   Total Winnings Awarded:', winnings, 'ETB');
  console.log('='.repeat(60));
  
  // Get bot's balance before payout
  const botBefore = await Bot.findById(winningBot._id).select('balance name telegramId');
  console.log(`💵 [BOT BALANCE BEFORE] ${winningBot.name}: ${botBefore?.balance || 0} ETB`);
  
  // THE PAYOUT: Add currentPool to the winning bot's balance
  await Bot.findByIdAndUpdate(winningBot._id, { 
    $inc: { balance: winnings, totalWins: 1, totalWinnings: winnings, gamesPlayed: 1 } 
  });
  
  // Get bot's balance after payout
  const botAfter = await Bot.findById(winningBot._id).select('balance name telegramId');
  console.log(`💵 [BOT BALANCE AFTER] ${winningBot.name}: ${botAfter?.balance || 0} ETB`);
  console.log(`💸 [BALANCE INCREASE] +${winnings} ETB added to bot`);
  console.log(`💰 [PAYOUT SUCCESS] Bot ${winningBot.name} awarded ${winnings} ETB`);
  console.log('='.repeat(60) + '\\n');
  
  // Reset room pool
  await RoomPool.findOneAndUpdate(
    { roomAmount: gameSession.roomAmount },
    { $set: { currentPool: 0, players: [] } }
  );
  
  gameSession.gameStatus = 'completed';
  gameSession.completedAt = new Date();
  gameSession.winner = winningBot.telegramId.toString(); // Store as string to match schema
  gameSession.winnerName = winningBot.name;
  gameSession.winningPattern = winResult.pattern;
  gameSession.isBotWin = true;
  await gameSession.save();
  
  // Clear bot injection tracking for this room when game completes
  const { clearBotInjectionForRoom } = require('./botInjectionPlane');
  clearBotInjectionForRoom(roomAmount);
  
  // BROADCAST GAME_OVER: Send Socket.io event to frontend
  // Use proper room-scoped emission to ensure all players in the game receive it
  try {
    const io = getIO();
    if (io) {
      io.to(`game:${gameSession._id}`).emit('GAME_OVER', buildGameOverPayload({
        sessionId: gameSession._id,
        winner: winningBot.name,
        winnerName: winningBot.name,
        isBot: true,
        pattern: winResult.pattern,
        winnings: winnings,
        roomAmount: roomAmount,
        message: `Bot ${winningBot.name} has won the ${winnings} ETB pool!`
      }));
      console.log(`📡 Broadcasted GAME_OVER to room game:${gameSession._id}`);
    } else {
      console.warn('⚠️ Socket.io instance not found');
    }
  } catch (err) {
    console.warn('⚠️ Socket.io not available, skipping GAME_OVER broadcast:', err.message);
  }
}

/**
 * Auto-refill bot balances when they fall below minimum threshold
 * Ensures bots can always participate in games
 * @param {number} minBalance - Minimum balance threshold (default: 500 ETB)
 * @param {number} refillAmount - Amount to add when below threshold (default: 1000 ETB)
 * @returns {Promise<Object>} - { refilled, totalAdded }
 */
async function autoRefillBotBalances(minBalance = 500, refillAmount = 1000) {
  try {
    const lowBalanceBots = await Bot.find({ 
      isActive: true, 
      balance: { $lt: minBalance } 
    });
    
    if (lowBalanceBots.length === 0) {
      console.log('✅ All bots have sufficient balance');
      return { refilled: 0, totalAdded: 0 };
    }
    
    console.log(`💰 Refilling ${lowBalanceBots.length} bots with low balance...`);
    
    const refillOps = lowBalanceBots.map(bot => ({
      updateOne: {
        filter: { _id: bot._id },
        update: { 
          $inc: { balance: refillAmount, refillCount: 1 },
          lastRefill: new Date()
        }
      }
    }));
    
    const result = await Bot.bulkWrite(refillOps);
    
    console.log(`✅ Refilled ${result.modifiedCount} bots with ${refillAmount} ETB each`);
    
    return { 
      refilled: result.modifiedCount,
      totalAdded: result.modifiedCount * refillAmount
    };
  } catch (error) {
    console.error('❌ Error refilling bot balances:', error.message);
    throw error;
  }
}

/**
 * Reset all bot balances to 1000 ETB every 24 hours
 * This prevents unlimited wealth accumulation and maintains game balance
 * Logs detailed information about each bot's state before and after reset
 */
async function resetBotBalancesDaily() {
  try {
    console.log('\n🔄 ========================================');
    console.log('🔄 STARTING DAILY BOT BALANCE RESET');
    console.log('🔄 ========================================\n');
    
    const resetTime = new Date();
    const allBots = await Bot.find({}).sort({ name: 1 });
    
    if (allBots.length === 0) {
      console.log('⚠️ No bots found in database');
      return { reset: 0, totalResetAmount: 0 };
    }
    
    console.log(`📊 Found ${allBots.length} bots to process\n`);
    
    let totalResetAmount = 0;
    const INITIAL_BALANCE = 1000;
    const resetDetails = [];
    
    for (const bot of allBots) {
      const previousBalance = bot.balance;
      const balanceChange = INITIAL_BALANCE - previousBalance;
      
      // Log detailed bot state BEFORE reset
      console.log(`----------------------------------------`);
      console.log(`🤖 Bot: ${bot.name} (${bot.telegramId})`);
      console.log(`   📈 Previous Balance: ${previousBalance} ETB`);
      console.log(`   🎯 Target Balance: ${INITIAL_BALANCE} ETB`);
      console.log(`   💵 Change: ${balanceChange >= 0 ? '+' : ''}${balanceChange} ETB`);
      console.log(`   🏆 Total Wins: ${bot.totalWins}`);
      console.log(`   💰 Total Winnings (lifetime): ${bot.totalWinnings} ETB`);
      console.log(`   🎮 Games Played: ${bot.gamesPlayed}`);
      console.log(`   📊 Win Rate: ${bot.winRate.toFixed(2)}%`);
      console.log(`   ⚙️  Difficulty: ${bot.difficulty}`);
      console.log(`   ✅ Active: ${bot.isActive}`);
      console.log(`   🕐 Last Played: ${bot.lastPlayed ? bot.lastPlayed.toISOString() : 'Never'}`);
      console.log(`   🕐 Last Refill: ${bot.lastRefill ? bot.lastRefill.toISOString() : 'Never'}`);
      console.log(`   🔄 Refill Count: ${bot.refillCount}`);
      
      // Update bot balance and increment refill count
      await Bot.findByIdAndUpdate(bot._id, {
        $set: { 
          balance: INITIAL_BALANCE,
          lastRefill: new Date()
        },
        $inc: { refillCount: 1 }
      });
      
      totalResetAmount += Math.abs(balanceChange);
      
      // Log confirmation AFTER reset
      console.log(`   ✅ Balance reset successfully`);
      console.log(`   🆕 New Balance: ${INITIAL_BALANCE} ETB\n`);
      
      resetDetails.push({
        name: bot.name,
        telegramId: bot.telegramId,
        previousBalance,
        newBalance: INITIAL_BALANCE,
        change: balanceChange,
        totalWins: bot.totalWins,
        gamesPlayed: bot.gamesPlayed,
        winRate: bot.winRate
      });
    }
    
    // Summary report
    console.log('\n🔄 ========================================');
    console.log('🔄 DAILY BOT BALANCE RESET COMPLETE');
    console.log('🔄 ========================================');
    console.log(`📊 Total Bots Processed: ${allBots.length}`);
    console.log(`💵 Total Amount Reset: ${totalResetAmount} ETB`);
    console.log(`🕐 Reset Time: ${resetTime.toISOString()}`);
    console.log('🔄 ========================================\n');
    
    return { 
      reset: allBots.length,
      totalResetAmount,
      details: resetDetails
    };
  } catch (error) {
    console.error('❌ Error resetting bot balances:', error.message);
    throw error;
  }
}

/**
 * Start the daily bot balance reset scheduler
 * Runs every 24 hours at midnight (or specified time)
 */
function startDailyBotReset(hour = 0, minute = 0) {
  // Clear any existing interval
  if (botResetIntervalId) {
    clearInterval(botResetIntervalId);
    botResetIntervalId = null;
  }
  
  // Calculate initial delay until next scheduled time
  const now = new Date();
  const nextRun = new Date();
  nextRun.setHours(hour, minute, 0, 0);
  
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const initialDelay = nextRun.getTime() - now.getTime();
  
  console.log(`⏰ Daily bot reset scheduled for ${hour}:${minute.toString().padStart(2, '0')}`);
  console.log(`⏰ First run in ${Math.round(initialDelay / 1000 / 60)} minutes`);
  
  // Run first reset after initial delay
  setTimeout(async () => {
    await resetBotBalancesDaily();
    
    // Then run every 24 hours
    botResetIntervalId = setInterval(async () => {
      await resetBotBalancesDaily();
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
  }, initialDelay);
}

/**
 * Stop the daily bot reset scheduler
 */
function stopDailyBotReset() {
  if (botResetIntervalId) {
    clearInterval(botResetIntervalId);
    botResetIntervalId = null;
    console.log('⏹️ Daily bot reset scheduler stopped');
  }
}

/**
 * Get current status of the bot reset scheduler
 */
function getBotResetStatus() {
  return {
    isRunning: botResetIntervalId !== null,
    intervalId: botResetIntervalId
  };
}

/**
 * Regenerate a fresh bingo card for a specific bot
 * Called when bot enters a new game to ensure unique cards per game
 * @param {string} botId - Bot MongoDB ID or telegramId
 * @returns {Promise<Object>} - Updated bot with new card
 */
async function regenerateBotCard(botId) {
  try {
    const bot = await Bot.findOne({ 
      $or: [{ _id: botId }, { telegramId: botId }] 
    });
    
    if (!bot) {
      console.warn(`⚠️ Bot not found for card regeneration: ${botId}`);
      return null;
    }
    
    // Generate fresh card
    bot.generateCard();
    await bot.save();
    
    console.log(`🔄 Regenerated card for bot ${bot.name}`);
    
    return bot;
  } catch (error) {
    console.error('❌ Error regenerating bot card:', error.message);
    throw error;
  }
}

module.exports = {
  initializeBots,
  getActiveBots,
  getRandomBot,
  simulateBotMove,
  checkBotWin,
  ensureAllBotsHaveCards,
  getBotReactionTime,
  buildGameOverPayload,
  processBotMoves,
  handleBotWin,
  autoRefillBotBalances,
  regenerateBotCard,
  resetBotBalancesDaily,
  startDailyBotReset,
  stopDailyBotReset,
  getBotResetStatus,
  setIO,
  getIO
};
