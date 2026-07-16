const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');
const GameSession = require('../models/GameSession');
const Transaction = require('../models/Transaction');
const Bot = require('../models/Bot');
const { getIO } = require('../utils/botManager'); // Import getIO function
const { initializeBots, simulateBotMove, checkBotWin, ensureAllBotsHaveCards, processBotMoves: processBotMovesFromManager, handleBotWin: handleBotWinFromManager, getBotReactionTime, buildGameOverPayload } = require('../utils/botManager');
const { updateBotBalance, updateUserBalance } = require('../utils/balanceManager');

// BOT SPEED CONFIGURATION: 2 second reaction time (imported from botManager)
const BOT_REACTION_TIME_MS = getBotReactionTime();

// Re-export wrapper functions for local use with game session context
async function processBotMoves(gameSession, calledNumber) {
  return await processBotMovesLocal(gameSession, calledNumber);
}

function emitBotMoveSummary(io, gameSession) {
  if (!io || !gameSession?.players) return;

  const botMarks = gameSession.players
    .filter(player => player.isBot)
    .map(player => ({
      name: player.name,
      markedCount: Array.isArray(player.markedState) ? player.markedState.flat().filter(Boolean).length : 0,
      isBot: true
    }));

  io.to(`game:${gameSession._id}`).emit('BOT_MOVE', {
    botMarks,
    callCount: Array.isArray(gameSession.calledNumbers) ? gameSession.calledNumbers.length : 0,
    sessionId: gameSession._id,
    message: 'Bots are playing in the room'
  });
}

async function handleBotWin(gameSession, winningBot, playerIndex, winResult) {
  return await handleBotWinFromManager(gameSession, winningBot, playerIndex, winResult);
}
const { getInjectionPlan, calculateAtomicPrize, getBotsForStreak, calculateStreak, getPrizeForStreakAndRoom } = require('../utils/botInjectionPlane');
const { autoRefillBotBalances, regenerateBotCard } = require('../utils/botManager');

// Bot win tracking variables REMOVED - bots now play fairly without manipulation

// Bot Injection Control Sheet: Tracks which bots are in which rooms
// Format: Map<roomId, Set<botId>>
const botInjectionSheet = new Map();

// Anti-Flood Protection: Track processing state per room to prevent duplicate injections
const roomProcessingState = new Map();

// Resource Guard: Maximum bots to inject in a single request
const MAX_BOTS_PER_REQUEST = 13;

/**
 * Deduct balance from bot wallet account (Transaction Hook)
 * Atomic update with validation to prevent negative balances
 */
async function deductBotBalance(botId, amount) {
  const result = await Bot.findOneAndUpdate(
    { 
      _id: botId,
      balance: { $gte: amount } // Ensure sufficient balance
    },
    { 
      $inc: { balance: -amount, gamesPlayed: 1 } 
    },
    { new: true }
  );
  
  if (!result) {
    throw new Error(`Bot ${botId} has insufficient balance for entry fee`);
  }
  
  return result;
}

router.get('/rooms', auth, async (req, res) => {
  try {
    // OPTIMIZATION: Fetch all data in parallel using Promise.all instead of sequential loop
    const [rooms, activeSessions] = await Promise.all([
      RoomPool.find().select('roomAmount currentPool houseTotal players').lean(),
      GameSession.find({ 
        gameStatus: { $in: ['waiting', 'active'] } 
      }).select('roomAmount players').lean()
    ]);
    
    // Create a map of roomAmount -> player count for O(1) lookup
    const sessionPlayerCounts = new Map();
    activeSessions.forEach(session => {
      sessionPlayerCounts.set(session.roomAmount, session.players.length);
    });
    
    // Single Source of Truth: Calculate prize pool fresh from entry fee and player count
    const roomsData = {};
    for (const r of rooms) {
      const entryFee = r.roomAmount;
      
      // Get player count from pre-fetched sessions (O(1) lookup)
      const totalPlayers = sessionPlayerCounts.has(entryFee) 
        ? sessionPlayerCounts.get(entryFee) 
        : r.players.length;
      
      // Use atomic prize calculation: (fee * players) * 0.85
      const prizePool = Math.floor((entryFee * totalPlayers) * 0.85);
      
      roomsData[entryFee] = { 
        pool: r.currentPool,  // Keep for reference
        players: totalPlayers, // Total includes humans AND injected bots
        prizePool: prizePool  // Single Source of Truth for display
      };
    }
    
    res.json({ success: true, rooms: roomsData });
  } catch (err) {
    console.error('Fetch rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Single Source of Truth: Calculate room prize with 15% house cut
function calculateRoomPrize(entryFee, totalPlayers) {
  const safeFee = Number(entryFee) || 0;
  const safePlayers = Number(totalPlayers) || 0;
  // Formula: (entryFee * totalPlayers) * 0.85, rounded down
  return Math.floor((safeFee * safePlayers) * 0.85);
}

// Bot injection tracking sheet - tracks which bots are in which rooms
// Note: Now using botInjectionPlane.js for deterministic injection rules
// (botInjectionSheet is declared at top of file near imports)

/**
 * Get the milestone prize for a given entry fee and player count
 * Returns the exact prize from the master sheet: (fee * players) * 0.85
 * DEPRECATED: Use calculateAtomicPrize from botInjectionPlane.js instead
 */
function getMilestonePrize(entryFee, totalPlayers) {
  const safeFee = Number(entryFee) || 0;
  const safePlayers = Number(totalPlayers) || 0;
  // Formula: (entryFee * totalPlayers) * 0.85, rounded down
  return Math.floor((safeFee * safePlayers) * 0.85);
}

/**
 * Find the next milestone target for bot injection
 * DEPRECATED: Use getInjectionPlan from botInjectionPlane.js instead
 */
function getNextMilestone(currentCount) {
  // MILESTONES array removed - using botInjectionPlane.js now
  return currentCount; // No-op, always return current count
}

/**
 * Initialize bot injection tracking for a room
 */
function initBotInjectionTracking(roomAmount) {
  if (!botInjectionSheet.has(roomAmount)) {
    botInjectionSheet.set(roomAmount, new Set());
  }
  return botInjectionSheet.get(roomAmount);
}

/**
 * Get all bots currently injected in a room
 */
function getInjectedBotsInRoom(roomAmount) {
  return botInjectionSheet.get(roomAmount) || new Set();
}

/**
 * Add a bot to the injection tracking sheet
 */
function trackBotInjection(roomAmount, botTelegramId) {
  initBotInjectionTracking(roomAmount);
  botInjectionSheet.get(roomAmount).add(botTelegramId);
}

/**
 * Remove a bot from the injection tracking sheet (when game completes)
 */
function untrackBotInjection(roomAmount, botTelegramId) {
  const trackedBots = botInjectionSheet.get(roomAmount);
  if (trackedBots) {
    trackedBots.delete(botTelegramId);
  }
}

/**
 * Clear all bot injections for a room (when game completes)
 */
function clearBotInjectionForRoom(roomAmount) {
  botInjectionSheet.set(roomAmount, new Set());
}

/**
 * Get count of injected bots in a room
 */
function getInjectedBotsCount(roomAmount) {
  const trackedBots = botInjectionSheet.get(roomAmount);
  return trackedBots ? trackedBots.size : 0;
}

// Initialize/reset bots endpoint (admin only) - Forces card generation
router.post('/bots/init', auth, async (req, res) => {
  try {
    if (!req.isAdminAuth) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Force re-initialization with cards
    await initializeBots();
    await ensureAllBotsHaveCards();
    
    const botCount = await Bot.countDocuments();
    const botsWithCards = await Bot.countDocuments({ 
      cardGrid: { $ne: [[0]], $exists: true, $size: { $gte: 5 } } 
    });
    
    res.json({ 
      success: true, 
      message: 'Bots initialized with bingo cards', 
      count: botCount,
      botsWithCards 
    });
  } catch (err) {
    console.error('Init bots error:', err.message);
    res.status(500).json({ error: `Failed to initialize bots: ${err.message}` });
  }
});

// Endpoint to regenerate cards for all bots (admin only)
router.post('/bots/regenerate-cards', auth, async (req, res) => {
  try {
    if (!req.isAdminAuth) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await ensureAllBotsHaveCards();
    
    const botCount = await Bot.countDocuments();
    const botsWithCards = await Bot.countDocuments({ 
      cardGrid: { $ne: [[0]], $exists: true, $size: { $gte: 5 } } 
    });
    
    res.json({ 
      success: true, 
      message: 'Bot cards regenerated', 
      totalBots: botCount,
      botsWithValidCards: botsWithCards 
    });
  } catch (err) {
    console.error('Regenerate cards error:', err.message);
    res.status(500).json({ error: `Failed to regenerate cards: ${err.message}` });
  }
});

// Get all bots status (admin only)
router.get('/bots', auth, async (req, res) => {
  try {
    if (!req.isAdminAuth) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const bots = await Bot.find().select('-__v');
    res.json({ success: true, bots });
  } catch (err) {
    console.error('Get bots error:', err);
    res.status(500).json({ error: 'Failed to get bots' });
  }
});

router.post('/join', auth, validate('joinRoom'), async (req, res) => {
  try {
    const { roomAmount } = req.body;
    
    // DATA SAFETY: Convert roomAmount to Number explicitly
    const amount = Number(roomAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid room amount' });
    }
    
    // ============================================
    // 📝 COMPREHENSIVE USER ACTION LOGGING
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('🎮 [JOIN REQUEST] User attempting to join game');
    console.log('='.repeat(60));
    console.log('👤 User ID:', req.user._id);
    console.log('👤 User Name:', req.user.firstName || req.user.username || 'Unknown');
    console.log('💰 Entry Fee:', amount, 'ETB');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('='.repeat(60));
    
    // Get user's current balance before deduction
    const userBefore = await User.findById(req.user._id).select('balance firstName username telegramId');
    console.log('💵 [BEFORE JOIN] Current Balance:', userBefore?.balance || 0, 'ETB');
    console.log('='.repeat(60) + '\n');
    
    // SECURITY FIX: Use atomic update with condition to prevent race conditions and double-spending
    const updatedUser = await User.findOneAndUpdate(
      { 
        _id: req.user._id,
        balance: { $gte: amount } // Condition: must have sufficient balance
      },
      { $inc: { balance: -amount } },
      { new: true, select: 'balance telegramId firstName username' }
    );
    
    if (!updatedUser) {
      console.error('❌ [JOIN FAILED] Insufficient balance for user:', req.user._id);
      console.log('   Required:', amount, 'ETB');
      console.log('   Available:', userBefore?.balance || 0, 'ETB');
      return res.status(400).json({ error: 'Insufficient Money' });
    }
    
    // Log balance deduction
    console.log('💸 [BALANCE DEDUCTED] Entry fee paid');
    console.log('   Previous Balance:', userBefore.balance, 'ETB');
    console.log('   Amount Deducted:', amount, 'ETB');
    console.log('   New Balance:', updatedUser.balance, 'ETB');
    console.log('   Room Entered:', amount, 'ETB room');
    console.log('='.repeat(60) + '\n');

    // Atomic upsert for room pool
    let roomPool = await RoomPool.findOneAndUpdate(
      { roomAmount: amount },
      { $setOnInsert: { roomAmount: amount, currentPool: 0, houseTotal: 0, players: [] } },
      { upsert: true, new: true }
    );

    // Allow client to provide a selected cartela (1-100) which will deterministically generate the card
    const selectedCard = req.body.selectedCard || req.body.selectedCartela || null;
    const { cardGrid, markedState } = GameSession.generateCard(selectedCard);

    // Create transaction asynchronously (non-blocking)
    Transaction.create({ userId: req.user._id, type: 'game_entry', amount: -amount, status: 'completed', metadata: { roomAmount: amount } }).catch(console.error);

    // Build human player data - Store user ID as STRING to match schema
    const humanPlayer = { 
      user: req.user._id.toString(), // Convert ObjectId to String
      telegramId: updatedUser.telegramId,
      name: updatedUser.firstName || updatedUser.username || 'Player',
      isBot: false,
      cardGrid, 
      markedState 
    };
    
    // Find or create game session with only the human player initially
    let gameSession = await GameSession.findOne({ roomAmount: amount, gameStatus: { $in: ['waiting', 'active'] } });
    
    if (!gameSession) {
      gameSession = await GameSession.create({ 
        roomAmount: amount, 
        gameStatus: 'active',
        startedAt: new Date(),
        players: [humanPlayer]
      });
    } else {
      // SECURITY FIX: Check if player already in this session to prevent duplicates
      const existingPlayer = gameSession.players.find(p => p.user === req.user._id.toString());
      if (!existingPlayer) {
        gameSession.players.push(humanPlayer);
        if (gameSession.gameStatus === 'waiting') { 
          gameSession.gameStatus = 'active'; 
          gameSession.startedAt = new Date(); 
        }
        await gameSession.save();
      }
    }

    // BOT INJECTION CONTROL PLANE: Streak-based injection with Master Milestone Sheet
    // Step 1: Calculate user's current streak based on last game time
    const streakResult = calculateStreak(updatedUser.lastGameTime, updatedUser.currentStreak || 0);
    const userStreak = streakResult.newStreak;
    
    // Update user's streak and last game time in database
    await User.findByIdAndUpdate(req.user._id, {
      currentStreak: userStreak,
      lastGameTime: new Date()
    });
    
    console.log(`📈 User ${req.user._id} streak: ${updatedUser.currentStreak || 0} → ${userStreak} (reset: ${streakResult.shouldReset})`);
    
    // ANTI-FLOOD: Check if this room is already being processed
    const processingKey = `${amount}_${req.user._id}`;
    if (roomProcessingState.get(processingKey)) {
      console.log(`⚠️ Anti-flood: User ${req.user._id} already processing join for room ${amount}`);
      // Player already added, just return success without re-injecting bots
      const existingSession = await GameSession.findOne({ roomAmount: amount, gameStatus: { $in: ['waiting', 'active'] } });
      const currentHumanCount = existingSession.players.filter(p => !p.isBot).length;
      const prizeCalculation = getPrizeForStreakAndRoom(amount, userStreak);
      return res.json({ 
        success: true, 
        game: { 
          sessionId: existingSession._id, 
          roomAmount: amount, 
          currentPool: roomPool.currentPool, 
          totalPrize: prizeCalculation.prizePool,
          playersCount: existingSession.players.length,
          humanPlayers: currentHumanCount,
          botPlayers: existingSession.players.filter(p => p.isBot).length,
          cardGrid, 
          markedState, 
          calledNumbers: existingSession.calledNumbers, 
          botsAdded: 0,
          streak: userStreak,
          message: 'Already joined - no duplicate bot injection'
        } 
      });
    }
    
    // Set processing flag
    roomProcessingState.set(processingKey, true);
    
    // Refresh game session to get latest player count after potential concurrent joins
    gameSession = await GameSession.findOne({ roomAmount: amount, gameStatus: { $in: ['waiting', 'active'] } });
    if (!gameSession) {
      // Session was deleted or completed, create new one with just this human
      gameSession = await GameSession.create({ 
        roomAmount: amount, 
        gameStatus: 'active',
        startedAt: new Date(),
        players: [humanPlayer]
      });
    }
    
    // MILESTONE CAP: Enforce hard limit at 28 players - STRICT CHECK BEFORE ANY INJECTION
    const currentTotalPlayers = gameSession.players.length;
    const maxPlayersAllowed = 28;
    
    // Count humans and bots separately for accurate tracking
    const currentHumans = gameSession.players.filter(p => !p.isBot).length;
    const currentBots = gameSession.players.filter(p => p.isBot).length;
    
    console.log(`📊 Room ${amount}: ${currentHumans} humans + ${currentBots} bots = ${currentTotalPlayers} total`);
    
    // If room already at maximum capacity, stop all injection - DO NOT ADD BOTS
    if (currentTotalPlayers >= maxPlayersAllowed) {
      console.log(`🛑 Milestone Cap: Room ${amount} at maximum capacity (${currentTotalPlayers}/28). Stopping bot injection.`);
      roomProcessingState.delete(processingKey);
      const prizeCalculation = getPrizeForStreakAndRoom(amount, userStreak);
      return res.json({ 
        success: true, 
        game: { 
          sessionId: gameSession._id, 
          roomAmount: amount, 
          currentPool: roomPool.currentPool, 
          totalPrize: prizeCalculation.prizePool,
          playersCount: currentTotalPlayers,
          humanPlayers: currentHumans,
          botPlayers: currentBots,
          cardGrid, 
          markedState, 
          calledNumbers: gameSession.calledNumbers, 
          botsAdded: 0,
          streak: userStreak,
          message: 'Room at maximum milestone capacity (28 players)'
        } 
      });
    }
    
    // Step 2: Get bots to inject based on streak from Master Sheet
    const botsToInject = getBotsForStreak(userStreak);
    
    // RESOURCE GUARD: Limit bots injected in single request to MAX_BOTS_PER_REQUEST
    let adjustedBotsToInject = botsToInject;
    if (adjustedBotsToInject > MAX_BOTS_PER_REQUEST) {
      console.log(`⚠️ Resource Guard: Capping bot injection from ${adjustedBotsToInject} to ${MAX_BOTS_PER_REQUEST}`);
      adjustedBotsToInject = MAX_BOTS_PER_REQUEST;
    }
    
    // MILESTONE ADJUSTMENT: Ensure we don't exceed the max milestone cap
    const maxBotsForMilestone = maxPlayersAllowed - currentTotalPlayers;
    if (adjustedBotsToInject > maxBotsForMilestone) {
      console.log(`⚠️ Milestone Cap: Reducing bot injection from ${adjustedBotsToInject} to ${maxBotsForMilestone} to stay under ${maxPlayersAllowed}`);
      adjustedBotsToInject = Math.max(0, maxBotsForMilestone);
    }
    
    // STREAK LOGIC FIX: Check if room already has bots from previous player
    // Do not add more bots if it will exceed the Streak Milestone target
    const targetTotalPlayers = currentHumans + adjustedBotsToInject;
    if (targetTotalPlayers > maxPlayersAllowed) {
      console.log(`⚠️ Streak Logic: Adjusting to prevent overflow. Target: ${targetTotalPlayers}, Max: ${maxPlayersAllowed}`);
      adjustedBotsToInject = Math.max(0, maxPlayersAllowed - currentTotalPlayers);
    }
    
    // Calculate total players after injection (humans already in room + bots we're about to add)
    const totalPlayersAfterInjection = currentHumans + adjustedBotsToInject;
    
    // MASTER SHEET MATH: Calculate prize pool strictly as (entryFee * totalPlayers) * 0.85
    const entryFee = amount;
    const finalPrize = Math.floor((entryFee * totalPlayersAfterInjection) * 0.85);
    
    const prizeCalculation = {
      prizePool: finalPrize,
      totalPlayers: totalPlayersAfterInjection,
      botsToInject: adjustedBotsToInject
    };
    
    // Get already tracked bots for this room from the injection sheet
    const trackedBotsInRoom = getInjectedBotsInRoom(amount);
    
    let injectedBots = [];
    
    // Inject bots if needed according to the plan
    if (adjustedBotsToInject > 0) {
      // AUTO-REFILL: Ensure all bots have sufficient balance before injection
      // This prevents bots from being excluded due to low balance
      await autoRefillBotBalances(500, 1000);
      
      // UNIQUE PARTICIPATION: Get available bots (exclude bots already in session AND already tracked AND in any active game)
      // FIXED: Use simple string comparison instead of ObjectId conversion
      const existingBotIds = gameSession.players
        .filter(p => p.isBot)
        .map(p => String(p.user));
      
      const trackedBotIds = Array.from(trackedBotsInRoom).map(id => String(id));
      
      const allExcludedBotIds = new Set([...existingBotIds, ...trackedBotIds]);
      
      // Find all active game sessions to exclude bots currently playing elsewhere
      const activeSessions = await GameSession.find({ gameStatus: 'active' }).select('players');
      const botsInActiveGames = new Set();
      activeSessions.forEach(session => {
        session.players.filter(p => p.isBot).forEach(botPlayer => {
          botsInActiveGames.add(String(botPlayer.user));
        });
      });
      
      console.log(`🔍 Bot Deduplication: Excluding ${allExcludedBotIds.size} tracked bots + ${botsInActiveGames.size} active bots`);
      
      // Query for available bots: not in this session, not tracked, not in other active games, isActive=true, has sufficient balance
      // Convert string IDs to ObjectId only for the database query filter
      const excludedObjectIds = Array.from(allExcludedBotIds).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
      const activeGameObjectIds = Array.from(botsInActiveGames).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
      
      const availableBots = await Bot.find({ 
        _id: { $nin: [...excludedObjectIds, ...activeGameObjectIds] },
        isActive: true,
        balance: { $gte: amount }
      }).limit(adjustedBotsToInject);
      
      console.log(`🤖 Bot Injection Plan: Streak ${userStreak} → injecting ${availableBots.length} bots (requested: ${adjustedBotsToInject})`);
      
      // OPTIMIZATION: Batch process bot updates using bulkWrite for better performance
      const botUpdates = [];
      
      // Process each bot: collect updates for batch operation
      for (const bot of availableBots) {
        // 🔄 FRESH CARD: Regenerate bot's card for this new game
        // This ensures bots have different cards in each game they play
        bot.generateCard();
        
        // BOT WALLET CHECK: If bot's balance is below entry fee after refill, reset it to 1,000 ETB
        if (bot.balance < amount) {
          console.log(`💰 Bot ${bot.name} balance too low (${bot.balance}), resetting to 1000 ETB`);
          bot.balance = 1000;
        }
        
        // Collect update operations for batch execution
        botUpdates.push({
          updateOne: {
            filter: { _id: bot._id },
            update: {
              $set: {
                cardGrid: bot.cardGrid,
                markedState: bot.markedState,
                lastPlayed: new Date()
              },
              $inc: { 
                gamesPlayed: 1,
                balance: -amount // Deduct entry fee from bot's balance
              }
            }
          }
        });
        
        // Use the bot's freshly generated card
        const botCard = bot.cardGrid;
        const botMarked = bot.markedState; // Already reset with free space marked
        
        const botPlayer = {
          user: bot.telegramId.toString(), // Ensure bot ID is stored as STRING
          name: bot.name,
          isBot: true,
          cardGrid: botCard,
          markedState: botMarked
        };
        
        gameSession.players.push(botPlayer);
        injectedBots.push(bot);
        
        // Track this bot injection in the sheet
        trackBotInjection(amount, bot.telegramId);
        
        // AUDIT LOG: Track bot entry fee deduction
        console.log(`💸 Bot ${bot.name} paid ${amount} ETB entry fee (new balance: ${bot.balance - amount})`);
      }
      
      // OPTIMIZATION: Execute all bot updates in a single batch operation
      if (botUpdates.length > 0) {
        await Bot.bulkWrite(botUpdates);
        console.log(`✅ Batch updated ${botUpdates.length} bots in single DB operation`);
      }
      
      // Save game session with all players (humans + bots)
      await gameSession.save();
      
      // Emit socket events to notify clients about bot joins
      try {
        const io = getIO();
        if (io) {
          // Emit individual bot join events for each injected bot
          for (let i = 0; i < injectedBots.length; i++) {
            io.to(`game:${gameSession._id}`).emit('botJoined', {
              sessionId: gameSession._id,
              count: currentHumans + i + 1,
              isBot: true,
              botName: injectedBots[i].name
            });
          }
          console.log(`📡 Emitted ${injectedBots.length} botJoined events for room ${amount}`);
        } else {
          console.warn('⚠️ Socket.io instance not found for botJoined events');
        }
      } catch (err) {
        console.warn('⚠️ Failed to emit botJoined events:', err.message);
      }
    }
    
    // Clear processing flag after completion
    roomProcessingState.delete(processingKey);
    
    // ATOMIC PRIZE CALCULATION: Use Master Sheet Math
    // Prize pool MUST equal (entryFee * totalPlayers) * 0.85 where totalPlayers includes humans + injected bots
    const calculatedPrizePool = finalPrize;
    const totalCollected = amount * prizeCalculation.totalPlayers;
    const houseCut = totalCollected - calculatedPrizePool; // 15% house edge
    
    // DATABASE SYNC: Update RoomPool with correct player count from GameSession
    // Get ALL player IDs (humans + bots) as strings for the RoomPool.players array
    const allPlayerIds = gameSession.players.map(p => {
      if (p.isBot) {
        return p.user.toString(); // Bot ID as string
      } else {
        return p.user.toString(); // Human ID as string
      }
    });
    
    await RoomPool.findByIdAndUpdate(
      roomPool._id,
      { 
        $set: { 
          currentPool: calculatedPrizePool,
          houseTotal: houseCut,
          players: allPlayerIds // Replace entire players array with all participants
        }
      }
    );

    const updatedRoomPool = await RoomPool.findOne({ roomAmount: amount });
    
    // ============================================
    // 📝 JOIN SUCCESS LOGGING
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ [JOIN SUCCESS] User successfully joined game');
    console.log('='.repeat(60));
    console.log('🎮 Session ID:', gameSession._id);
    console.log('💰 Room Amount:', amount, 'ETB');
    console.log('👥 Total Players:', gameSession.players.length);
    console.log('   - Humans:', gameSession.players.filter(p => !p.isBot).length);
    console.log('   - Bots:', injectedBots.length);
    console.log('💵 User Balance After Join:', updatedUser.balance, 'ETB');
    console.log('🏆 Potential Prize Pool:', finalPrize, 'ETB');
    console.log('📊 Streak Bonus:', userStreak);
    console.log('='.repeat(60) + '\n');
    
    res.json({ 
      success: true, 
      game: { 
        sessionId: gameSession._id, 
        roomAmount: amount, 
        currentPool: updatedRoomPool.currentPool, 
        totalPrize: finalPrize,
        playersCount: gameSession.players.length,
        humanPlayers: gameSession.players.filter(p => !p.isBot).length,
        botPlayers: injectedBots.length,
        cardGrid, 
        markedState, 
        calledNumbers: gameSession.calledNumbers, 
        botsAdded: injectedBots.length,
        streak: userStreak,
        newBalance: updatedUser.balance,
        totalPlayers: gameSession.players.length,
        currentPool: updatedRoomPool.currentPool,
        prizeBreakdown: {
          grossPool: totalCollected,
          houseCut: houseCut,
          netPrize: finalPrize,
          calculation: `${prizeCalculation.totalPlayers} players × ${amount}birr × 0.85`
        }
      } 
    });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ error: err.message || 'Failed to join room' });
  }
});

router.post('/mark', auth, async (req, res) => {
  try {
    const { sessionId, row, col } = req.body;
    
    // ============================================
    // 📝 HUMAN PLAYER MARK ACTION LOGGING
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('✋ [MARK ACTION] Human player marking a number');
    console.log('='.repeat(60));
    console.log('👤 User ID:', req.user._id);
    console.log('🎮 Session ID:', sessionId);
    console.log('📍 Coordinates: Row', row, 'Col', col);
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('='.repeat(60));
    
    // Validate coordinates first (fast fail) - 5x5 grid indexes 0..4
    if (row < 0 || row > 4 || col < 0 || col > 4) {
      console.error('❌ [MARK FAILED] Invalid coordinates:', row, col);
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    // Use lean() for faster query, but we need to save later so don't use lean here
    const gameSession = await GameSession.findOne({ _id: sessionId, gameStatus: 'active' })
      .select('players calledNumbers gameStatus');
    if (!gameSession) {
      console.error('❌ [MARK FAILED] Game not found or not active:', sessionId);
      return res.status(404).json({ error: 'Game not found or not active' });
    }

    const player = gameSession.players.find(p => p.user === req.user._id.toString());
    if (!player) {
      console.error('❌ [MARK FAILED] User not in this game:', req.user._id);
      return res.status(403).json({ error: 'Not in this game' });
    }
    
    const num = player.cardGrid[row][col];
    // Use Set for O(1) lookup instead of O(n) array includes
    const calledSet = new Set(gameSession.calledNumbers);
    if (!(row === 2 && col === 2) && !calledSet.has(num)) {
      console.warn('⚠️ [MARK REJECTED] Number not called yet:', num);
      return res.status(400).json({ error: 'Number not called yet' });
    }

    player.markedState[row][col] = !player.markedState[row][col];
    
    console.log('✅ [NUMBER MARKED] Grid position:', row, col);
    console.log('   Number on card:', num);
    console.log('   Marked state:', player.markedState[row][col] ? 'MARKED' : 'UNMARKED');
    
    // Use updateOne instead of save() for better performance (only updates changed fields)
    await GameSession.updateOne(
      { _id: sessionId },
      { $set: { [`players.${gameSession.players.indexOf(player)}.markedState`]: player.markedState } }
    );

    const playerIndex = gameSession.players.indexOf(player);
    const winResult = gameSession.checkWin(playerIndex);
    
    console.log('🔍 [WIN CHECK] Pattern detected:', winResult.win ? 'YES' : 'NO');
    if (winResult.win) {
      console.log('🎯 Winning pattern:', winResult.pattern);
      console.log('🏆 Player should claim win now!');
    }
    console.log('='.repeat(60) + '\n');
    
    // Process bot moves after human player marks (pass null since no new number was called)
    const botResult = await processBotMoves(gameSession, null);

    if (botResult && botResult.winner) {
      await handleBotWin(gameSession, botResult.winner, botResult.botIndex, botResult.winResult);
      return res.json({ success: true, marked: player.markedState[row][col], matches: player.markedState.flat().filter(Boolean).length - 1, win: true, pattern: winResult.pattern, gameOver: true, isBot: true, message: `Bot ${botResult.winner.name} won the game!` });
    }

    const io = getIO();
    emitBotMoveSummary(io, gameSession);

    res.json({ success: true, marked: player.markedState[row][col], matches: player.markedState.flat().filter(Boolean).length - 1, win: winResult.win, pattern: winResult.pattern });
  } catch (err) {
    console.error('Mark number error:', err);
    res.status(500).json({ error: 'Failed to mark number' });
  }
});

/**
 * Local bot move processor for game.js - wraps the imported function
 * This function is called after every callNumber() execution to activate bot play logic
 * @param {Object} gameSession - The game session
 * @param {number|null} calledNumber - The number that was just called (null if from mark endpoint)
 */
async function processBotMovesLocal(gameSession, calledNumber) {
  const botPlayers = gameSession.players.filter(p => p.isBot);
  
  if (botPlayers.length === 0) return null; // No bots to process
  
  console.log(`🤖 Processing ${botPlayers.length} bots${calledNumber ? ` for number ${calledNumber}` : ''}...`);
  
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
      // OPTIMIZATION: Use updateOne instead of save() for better performance
      await Bot.updateOne(
        { _id: bot._id },
        { $set: { cardGrid: bot.cardGrid, markedState: bot.markedState } }
      );
      // Update player's card in session - Compare as strings
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId.toString());
      if (botIndex !== -1) {
        gameSession.players[botIndex].cardGrid = bot.cardGrid;
        gameSession.players[botIndex].markedState = bot.markedState;
      }
    }

    // Simulate bot reaction with 2 second delay (only when a number is called)
    if (calledNumber) {
      await new Promise(resolve => setTimeout(resolve, BOT_REACTION_TIME_MS));
    }
    
    // THE TRIGGER: Find if the CALLED NUMBER exists on bot's card (DIRECT SCAN)
    let move = null;
    if (calledNumber) {
      // Directly scan the bot's card in the game session for the called number
      const playerIndex = gameSession.players.findIndex(p => p.user === bot.telegramId.toString());
      if (playerIndex !== -1) {
        const playerData = gameSession.players[playerIndex];
        const { cardGrid, markedState } = playerData;
        
        // Scan all 25 positions on the card
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 5; col++) {
            // If this position has the called number AND is not yet marked
            if (cardGrid[row][col] === calledNumber && !markedState[row][col]) {
              move = { row, col, num: calledNumber };
              console.log(`🎯 Bot ${bot.name} FOUND number ${calledNumber} at [${row},${col}]`);
              break;
            }
          }
          if (move) break;
        }
      }
    } else {
      // Fallback to simulateBotMove for other cases (e.g., initial mark endpoint)
      move = simulateBotMove(gameSession, bot);
    }
    
    if (move) {
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId.toString());
      if (botIndex !== -1) {
        // THE MARK: Update marked state in game session
        gameSession.players[botIndex].markedState[move.row][move.col] = true;
        
        console.log(`✅ Bot ${bot.name} marked position [${move.row},${move.col}] = ${move.num}`);
        
        // CRITICAL: Save the game session immediately to persist the marked state
        await gameSession.save();
        
        // Reload the game session to ensure we have the latest state
        const freshSession = await GameSession.findById(gameSession._id).select('players calledNumbers gameStatus');
        
        // THE WIN CHECK: Run checkWin() after every mark using fresh session data
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
 */
async function handleBotWin(gameSession, bot, playerIndex, winResult) {
  const roomAmount = gameSession.roomAmount;
  
  // ============================================
  // 📝 BOT WIN EVENT LOGGING
  // ============================================
  console.log('\n' + '='.repeat(60));
  console.log('🤖 [BOT WIN EVENT] Bot has won the game!');
  console.log('='.repeat(60));
  console.log('🤖 Bot ID:', bot.telegramId);
  console.log('🤖 Bot Name:', bot.name);
  console.log('🎮 Room Amount:', roomAmount, 'ETB');
  console.log('🎯 Winning Pattern:', winResult.pattern);
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.log('='.repeat(60));
  
  // Get the room pool with current prize value BEFORE resetting (critical for correct payout)
  const roomPoolBeforeReset = await RoomPool.findOne({ roomAmount: gameSession.roomAmount });
  
  if (!roomPoolBeforeReset) {
    console.error('❌ [BOT WIN] Room pool not found for room:', roomAmount);
    return;
  }
  
  // Capture the actual pool values before they're reset
  const poolValue = roomPoolBeforeReset.currentPool || 0; // already 85% prize
  const houseTotalValue = roomPoolBeforeReset.houseTotal || 0; // 15% house cut

  // Total winnings to award to winner should be the prize pool only (poolValue)
  const winnings = poolValue;
  
  console.log('\n💰 [PAYOUT CALCULATION]');
  console.log('   Total Players in Game:', gameSession.players.length);
  console.log('   Entry Fee per Player:', roomAmount, 'ETB');
  console.log('   Total Pool Generated:', poolValue, 'ETB');
  console.log('   House Total (15%):', houseTotalValue, 'ETB');
  console.log('   Total Winnings Awarded:', winnings, 'ETB');
  console.log('='.repeat(60));
  
  // HOUSE CUT SEPARATION: Transfer 15% house cut to Admin Wallet BEFORE payout
  const houseCut = houseTotalValue;
  if (houseCut > 0) {
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.length > 0) {
      await User.findByIdAndUpdate(
        adminIds[0],
        { $inc: { balance: houseCut } },
        { upsert: true }
      );
      console.log(`🏦 [HOUSE CUT] ${houseCut} ETB transferred to Admin Wallet`);
    }
  }
  
  // DEBUG LOG: Show pool breakdown
  console.log(`💰 [PAYOUT BREAKDOWN] Pool: ${poolValue}, House: ${houseTotalValue}, Total: ${winnings}`);
  
  // Get bot's balance before payout
  const botBefore = await Bot.findById(bot._id).select('balance name telegramId');
  console.log(`💵 [BOT BALANCE BEFORE] ${bot.name}: ${botBefore?.balance || 0} ETB`);
  
  // THE PAYOUT: Add winnings to the winning bot's balance (with retry logic)
  await updateBotBalance(bot._id, winnings, true);
  
  // Get bot's balance after payout
  const botAfter = await Bot.findById(bot._id).select('balance name telegramId');
  console.log(`💵 [BOT BALANCE AFTER] ${bot.name}: ${botAfter?.balance || 0} ETB`);
  console.log(`💸 [BALANCE INCREASE] +${winnings} ETB added to bot`);
  
  console.log(`💰 [PAYOUT SUCCESS] Bot ${bot.name} awarded ${winnings} ETB`);
  // AUDIT LOG: Track successful payout
  console.log(`[PAYOUT] Successfully moved ${winnings} ETB to Bot: ${bot.telegramId}`);
  console.log('='.repeat(60) + '\n');
  
  // Reset room pool after capturing values (including houseTotal since it's been transferred to admin)
  await RoomPool.findOneAndUpdate(
    { roomAmount: gameSession.roomAmount },
    { $set: { currentPool: 0, houseTotal: 0, players: [] } }
  );
  
  gameSession.gameStatus = 'completed';
  gameSession.completedAt = new Date();
  gameSession.winner = bot.telegramId.toString(); // Store as string to match schema
  gameSession.winnerName = bot.name;
  gameSession.winningPattern = winResult.pattern;
  gameSession.isBotWin = true;
  await gameSession.save();
  
  // Clear bot injection tracking for this room when game completes
  clearBotInjectionForRoom(roomAmount);
  
  // Bots play fairly - no win manipulation or forced patterns
  // Each bot has equal chance to win based on their card and called numbers
  
  // BROADCAST GAME_OVER: Send Socket.io event to frontend with proper room scoping
  const io = getIO();
  if (io) {
    io.to(`game:${gameSession._id}`).emit('GAME_OVER', {
      sessionId: gameSession._id,
      winner: bot.name,
      winnerName: bot.name,
      isBot: true,
      pattern: winResult.pattern,
      winnings: winnings,
      roomAmount: roomAmount,
      message: `Bot ${bot.name} has won the ${winnings} ETB pool!`
    });
    console.log(`📡 [BOT WIN] Broadcasted GAME_OVER to room game:${gameSession._id}`);
  } else {
    console.warn('⚠️ [BOT WIN] Socket.io instance not found');
  }
}

router.post('/claim', auth, async (req, res) => {
  try {
    console.log('🎯 [CLAIM] Win claim request received');
    console.log('🎯 [CLAIM] User ID:', req.user._id);
    console.log('🎯 [CLAIM] Is Admin Auth:', req.isAdminAuth);
    console.log('🎯 [CLAIM] Request body:', JSON.stringify(req.body));
    
    const { sessionId } = req.body;
    console.log('🔍 [CLAIM] Looking up game session:', sessionId);
    
    const gameSession = await GameSession.findOne({ 
      _id: sessionId, 
      gameStatus: 'active' 
    }).select('players roomAmount calledNumbers');
    
    if (!gameSession) {
      console.error('❌ [CLAIM] Game session not found or not active:', sessionId);
      return res.status(404).json({ error: 'Game not found' });
    }
    
    console.log('✅ [CLAIM] Game session found:', {
      roomId: gameSession.roomAmount,
      playerCount: gameSession.players.length,
      calledNumbers: gameSession.calledNumbers.length
    });

    const userIdStr = req.user._id.toString();
    console.log('🔍 [CLAIM] Looking for user in players:', userIdStr);
    
    const playerIndex = gameSession.players.findIndex(p => {
      const match = p.user === userIdStr;
      console.log('  - Player:', p.user, 'Match:', match);
      return match;
    });
    
    if (playerIndex === -1) {
      console.error('❌ [CLAIM] User not found in game session players');
      return res.status(403).json({ error: 'Not in this game' });
    }
    
    console.log('✅ [CLAIM] User found at player index:', playerIndex);
    
    const winResult = gameSession.checkWin(playerIndex);
    console.log('🎯 [CLAIM] Win check result:', winResult);
    
    if (!winResult.win) {
      console.warn('⚠️ [CLAIM] No bingo pattern detected for user');
      return res.status(400).json({ error: 'No bingo pattern detected' });
    }

    // STEP 1: Calculate Total Pool using the Master Formula
    // totalPool = entryFee * totalPlayers (all players including bots)
    const totalPlayers = gameSession.players.length;
    const totalPool = gameSession.roomAmount * totalPlayers;
    
    // STEP 2: Calculate My Prize (85% of total pool)
    const prizeAmount = Math.floor(totalPool * 0.85);
    
    // STEP 3: Calculate House Cut (15% of total pool)
    const houseCut = Math.floor(totalPool * 0.15);
    
    console.log('\\n' + '='.repeat(60));
    console.log('💰 [CLAIM] PAYOUT CALCULATION:');
    console.log('='.repeat(60));
    console.log('  - Room Amount:', gameSession.roomAmount, 'ETB');
    console.log('  - Total Players:', totalPlayers);
    console.log('     - Humans:', gameSession.players.filter(p => !p.isBot).length);
    console.log('     - Bots:', gameSession.players.filter(p => p.isBot).length);
    console.log('  - Total Pool:', totalPool, 'ETB');
    console.log('  - Prize (85%):', prizeAmount, 'ETB');
    console.log('  - House Cut (15%):', houseCut, 'ETB');
    console.log('='.repeat(60) + '\\n');

    // Get user info for name display
    console.log('👤 [CLAIM] Fetching user info for:', req.user._id);
    const userInfo = await User.findById(req.user._id).select('firstName username telegramId balance');
    console.log('👤 [CLAIM] Current user balance:', userInfo?.balance || 0, 'ETB');
    
    // STEP 4: Execute Database Transaction - Transfer House Cut to Admin FIRST
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.length > 0 && houseCut > 0) {
      console.log('🏦 [CLAIM] Transferring house cut to admin:', adminIds[0]);
      const adminResult = await User.findByIdAndUpdate(
        adminIds[0],
        { $inc: { balance: houseCut } },
        { upsert: true, new: true }
      );
      console.log('✅ [CLAIM] House Cut transferred. Admin new balance:', adminResult?.balance);
    } else {
      console.log('⚠️ [CLAIM] No admin ID configured or house cut is 0');
    }
    
    // STEP 5: Execute Database Transaction - Award Prize to Winner (with retry logic)
    // Use String ID for the winner to match database format
    const winnerId = req.user._id.toString();
    console.log('💰 [CLAIM] Awarding prize to winner:', winnerId);
    console.log('💰 [CLAIM] Prize amount:', prizeAmount, 'ETB');
    
    // CRITICAL FIX: Use optimized balance update with retry logic
    const updatedUser = await updateUserBalance(winnerId, prizeAmount, {
      totalWins: 1,
      totalWinnings: prizeAmount,
      gamesPlayed: 1
    });
    
    if (!updatedUser) {
      console.error('❌ [CLAIM] CRITICAL: User not found after win verification!');
      return res.status(404).json({ success: false, message: 'User not found during prize award' });
    }

    console.log('✅ DB Update Result:', updatedUser); // CRITICAL DEBUG LOG
    console.log('✅ [CLAIM] User balance updated successfully!');
    console.log('💰 [CLAIM] New user balance:', updatedUser?.balance, 'ETB');
    console.log('💰 [CLAIM] Balance increase confirmed:', (updatedUser?.balance || 0) - (userInfo?.balance || 0), 'ETB');

    // Create transaction asynchronously
    console.log('📝 [CLAIM] Creating transaction record...');
    Transaction.create({ 
      userId: req.user._id, 
      type: 'winning', 
      amount: prizeAmount, 
      status: 'completed',
      description: `Bingo win in ${gameSession.roomAmount} ETB room`
    })
    .then(tx => console.log('✅ [CLAIM] Transaction record created:', tx._id))
    .catch(err => console.error('❌ [CLAIM] Failed to create transaction:', err));
    
    gameSession.gameStatus = 'completed'; 
    gameSession.completedAt = new Date(); 
    gameSession.winner = winnerId;
    gameSession.winnerName = userInfo.firstName || userInfo.username || 'Player';
    gameSession.winningPattern = winResult.pattern;
    gameSession.isBotWin = false;
    await gameSession.save();
    console.log('✅ [CLAIM] Game session marked as completed');
    
    // Clear bot injection tracking for this room when game completes (human win)
    clearBotInjectionForRoom(gameSession.roomAmount);
    console.log('🤖 [CLAIM] Bot injection tracking cleared for room:', gameSession.roomAmount);
    
    // Bots play fairly - no win manipulation tracking needed

    // Reset room pool after payout
    console.log('🏦 [CLAIM] Resetting room pool for:', gameSession.roomAmount);
    const poolUpdate = await RoomPool.findOneAndUpdate(
      { roomAmount: gameSession.roomAmount },
      { $set: { currentPool: 0, houseTotal: 0, players: [] } },
      { new: true }
    );
    console.log('✅ [CLAIM] Room pool reset. New pool state:', {
      currentPool: poolUpdate?.currentPool,
      houseTotal: poolUpdate?.houseTotal,
      players: poolUpdate?.players?.length || 0
    });

    // STEP 6: Final Verification Log
    console.log('\n' + '='.repeat(60));
    console.log('🏆 [WIN PAYOUT] HUMAN PLAYER WON!');
    console.log('='.repeat(60));
    console.log('👤 Winner ID:', winnerId);
    console.log('👤 Winner Name:', userInfo.firstName || userInfo.username);
    console.log('💰 Previous Balance:', userInfo?.balance || 0, 'ETB');
    console.log('💵 Prize Amount Added:', prizeAmount, 'ETB');
    console.log('💰 New Balance:', updatedUser?.balance, 'ETB');
    console.log('🎯 Winning Pattern:', winResult.pattern);
    console.log('🎮 Room Amount:', gameSession.roomAmount, 'ETB');
    console.log('👥 Total Players in Game:', totalPlayers);
    console.log('📊 Total Pool Generated:', totalPool, 'ETB');
    console.log('🏠 House Cut (15%):', houseCut, 'ETB');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('='.repeat(60) + '\n');

    res.json({ 
      success: true, 
      winnings: prizeAmount, 
      newBalance: updatedUser.balance, 
      pattern: winResult.pattern,
      winnerName: gameSession.winnerName,
      debug: {
        totalPool,
        houseCut,
        previousBalance: userInfo?.balance || 0,
        balanceIncrease: prizeAmount
      }
    });
    
    // BROADCAST GAME_OVER: Send Socket.io event to frontend for human wins
    const io = getIO();
    if (io) {
      io.to(`game:${gameSession._id}`).emit('GAME_OVER', {
        sessionId: gameSession._id,
        winner: gameSession.winnerName,
        winnerName: gameSession.winnerName,
        isBot: false,
        pattern: winResult.pattern,
        winnings: prizeAmount,
        roomAmount: gameSession.roomAmount,
        message: `${gameSession.winnerName} has won the ${prizeAmount} ETB pool!`
      });
      console.log(`📡 [HUMAN WIN] Broadcasted GAME_OVER to room game:${gameSession._id}`);
    } else {
      console.warn('⚠️ [HUMAN WIN] Socket.io instance not found');
    }
  } catch (err) {
    console.error('❌ [CLAIM] Claim win error:', err);
    console.error('❌ [CLAIM] Error stack:', err.stack);
    res.status(500).json({ error: 'Failed to claim win', details: err.message });
  }
});

router.post('/number/:sessionId', auth, async (req, res) => {
  try {
    // ============================================
    // 📝 NUMBER CALL ACTION LOGGING
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('🔢 [NUMBER CALLED] New bingo number drawn');
    console.log('='.repeat(60));
    console.log('🎮 Session ID:', req.params.sessionId);
    console.log('👤 Requested by User:', req.user._id);
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('='.repeat(60));
    
    const gameSession = await GameSession.findOne({ _id: req.params.sessionId, gameStatus: 'active' })
      .select('players calledNumbers gameStatus currentNumber');
    if (!gameSession) {
      console.error('❌ [NUMBER CALL FAILED] Game not found or not active:', req.params.sessionId);
      return res.status(404).json({ error: 'Game not found or not active' });
    }
    
    gameSession.calledNumbers = Array.isArray(gameSession.calledNumbers) ? gameSession.calledNumbers : [];
    
    console.log('📊 Current game state:');
    console.log('   Numbers called so far:', gameSession.calledNumbers.length);
    console.log('   Total players:', gameSession.players.length);
    console.log('   Humans:', gameSession.players.filter(p => !p.isBot).length);
    console.log('   Bots:', gameSession.players.filter(p => p.isBot).length);
    
    // Fast path: check if all numbers called
    if (gameSession.calledNumbers.length >= 75) {
      console.log('⚠️ [GAME COMPLETE] All 75 numbers have been called');
      return res.json({ success: true, number: null, complete: true, callCount: 75 });
    }
    
    // Generate available numbers efficiently using Set for O(1) lookup
    const calledSet = new Set(gameSession.calledNumbers);
    const available = [];
    for (let i = 1; i <= 75; i++) {
      if (!calledSet.has(i)) available.push(i);
    }
    
    if (available.length === 0) {
      console.log('⚠️ [GAME COMPLETE] No more numbers available');
      return res.json({ success: true, number: null, complete: true, callCount: 75 });
    }
    
    const nextNumber = available[Math.floor(Math.random() * available.length)];
    gameSession.calledNumbers.push(nextNumber);
    gameSession.currentNumber = nextNumber;
    await gameSession.save();
    
    const letter = ['B','I','N','G','O'][Math.floor((nextNumber - 1) / 15)];
    const display = `${letter}-${nextNumber}`;
    
    console.log('\n🎯 NUMBER DRAWN:', display);
    console.log('   Raw number:', nextNumber);
    console.log('   Call count:', gameSession.calledNumbers.length);
    console.log('='.repeat(60));
    
    // BROADCAST: Emit the called number to all players in real-time
    io.to(`game:${gameSession._id}`).emit('numberCalled', {
      number: nextNumber,
      display: display,
      callCount: gameSession.calledNumbers.length
    });
    
    // TRIGGER BOT MOVES: After calling a number, all bots check for matches and mark
    console.log('\n🤖 [BOT TURN] Processing bot moves...');
    const botResult = await processBotMoves(gameSession, nextNumber);
    
    // If a bot won, handle the payout and end the game
    if (botResult && botResult.winner) {
      await handleBotWin(gameSession, botResult.winner, botResult.botIndex, botResult.winResult);
      
      // Note: handleBotWin already broadcasts GAME_OVER event, so no need to duplicate
      
      // Return game over response
      return res.json({ 
        success: true, 
        number: nextNumber, 
        display: display, 
        callCount: gameSession.calledNumbers.length, 
        complete: true,
        gameOver: true,
        winner: botResult.winner.name,
        isBot: true,
        pattern: botResult.winResult.pattern,
        message: `Bot ${botResult.winner.name} has won the game!`
      });
    }
    
    // Reload game session to get updated bot states
    const updatedSession = await GameSession.findById(gameSession._id).select('players calledNumbers');
    
    // Build botMarks array to send to frontend
    const botMarks = [];
    for (const player of updatedSession.players) {
      if (player.isBot) {
        // Count how many marks this bot has
        const markedCount = player.markedState.flat().filter(Boolean).length;
        botMarks.push({
          name: player.name,
          markedCount: markedCount,
          isBot: true
        });
      }
    }
    
    // BROADCAST: Emit bot moves to all players in real-time
    if (botMarks.length > 0) {
      emitBotMoveSummary(io, updatedSession);
    }
    
    res.json({ 
      success: true, 
      number: nextNumber, 
      display: display, 
      callCount: gameSession.calledNumbers.length, 
      complete: available.length <= 1,
      botMarks: botMarks
    });
  } catch (err) {
    console.error('Call number error:', err);
    res.status(500).json({ error: 'Failed to call number' });
  }
});

// Legacy GET endpoint - redirects to POST for compatibility
router.get('/number/:sessionId', auth, async (req, res) => {
  try {
    const gameSession = await GameSession.findOne({ _id: req.params.sessionId, gameStatus: 'active' }).select('calledNumbers gameStatus currentNumber');
    if (!gameSession) return res.status(404).json({ error: 'Game not found' });
    
    // Fast path: check if all numbers called
    if (gameSession.calledNumbers.length >= 75) {
      return res.json({ success: true, number: null, complete: true, callCount: 75 });
    }
    
    // Generate available numbers efficiently using Set for O(1) lookup
    const calledSet = new Set(gameSession.calledNumbers);
    const available = [];
    for (let i = 1; i <= 75; i++) {
      if (!calledSet.has(i)) available.push(i);
    }
    
    if (available.length === 0) return res.json({ success: true, number: null, complete: true, callCount: 75 });
    
    const nextNumber = available[Math.floor(Math.random() * available.length)];
    const letter = ['B','I','N','G','O'][Math.floor((nextNumber - 1) / 15)];
    
    res.json({ success: true, number: nextNumber, display: `${letter}-${nextNumber}`, callCount: gameSession.calledNumbers.length, complete: available.length <= 1 });
  } catch (err) {
    console.error('Get number error:', err);
    res.status(500).json({ error: 'Failed to get number' });
  }
});

// Get game result with winner info (for popup display)
router.get('/result/:sessionId', auth, async (req, res) => {
  try {
    const gameSession = await GameSession.findOne({ _id: req.params.sessionId, gameStatus: 'completed' })
      .select('winner winnerName isBotWin winningPattern completedAt roomAmount');
    
    if (!gameSession) return res.status(404).json({ error: 'Game not found or not completed' });
    
    res.json({ 
      success: true, 
      winner: gameSession.winner,
      winnerName: gameSession.winnerName,
      isBot: gameSession.isBotWin,
      pattern: gameSession.winningPattern,
      completedAt: gameSession.completedAt,
      roomAmount: gameSession.roomAmount
    });
  } catch (err) {
    console.error('Get result error:', err);
    res.status(500).json({ error: 'Failed to get game result' });
  }
});

module.exports = router;
