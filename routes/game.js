const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');
const GameSession = require('../models/GameSession');
const Transaction = require('../models/Transaction');
const Bot = require('../models/Bot');
const { initializeBots, simulateBotMove, checkBotWin, ensureAllBotsHaveCards } = require('../utils/botManager');
const { getInjectionPlan, calculateAtomicPrize } = require('../utils/botInjectionPlane');

// Track consecutive wins for the win pattern logic
let consecutiveBotWins = 0;
let lastWinnerWasBot = false;

// Bot Injection Control Sheet: Tracks which bots are in which rooms
// Format: Map<roomId, Set<botId>>
const botInjectionSheet = new Map();

// Anti-Flood Protection: Track processing state per room to prevent duplicate injections
const roomProcessingState = new Map();

// Milestone caps for bot injection
const MILESTONE_CAPS = [8, 14, 20, 28];

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
    // Use lean() for faster queries (returns plain JS objects, not Mongoose docs)
    const rooms = await RoomPool.find().select('roomAmount currentPool houseTotal players').lean();
    
    // Single Source of Truth: Calculate prize pool fresh from entry fee and player count
    const roomsData = {};
    for (const r of rooms) {
      const entryFee = r.roomAmount;
      
      // Get active game session for this room to count total players
      const gameSession = await GameSession.findOne({ 
        roomAmount: entryFee, 
        gameStatus: { $in: ['waiting', 'active'] } 
      }).select('players').lean();
      
      // Count actual players array length from game session (includes humans + bots)
      const totalPlayers = gameSession ? gameSession.players.length : r.players.length;
      
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
    // Admin users cannot join rooms (no real DB record)
    if (req.isAdminAuth) {
      return res.status(403).json({ error: 'Admin accounts cannot join game rooms' });
    }
    
    const { roomAmount } = req.body;
    
    // SECURITY FIX: Use atomic update with condition to prevent race conditions and double-spending
    const updatedUser = await User.findOneAndUpdate(
      { 
        _id: req.user._id,
        balance: { $gte: roomAmount } // Condition: must have sufficient balance
      },
      { $inc: { balance: -roomAmount } },
      { new: true, select: 'balance telegramId firstName username' }
    );
    
    if (!updatedUser) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Atomic upsert for room pool
    let roomPool = await RoomPool.findOneAndUpdate(
      { roomAmount },
      { $setOnInsert: { roomAmount, currentPool: 0, houseTotal: 0, players: [] } },
      { upsert: true, new: true }
    );

    const { cardGrid, markedState } = GameSession.generateCard();

    // Create transaction asynchronously (non-blocking)
    Transaction.create({ userId: req.user._id, type: 'game_entry', amount: -roomAmount, status: 'completed', metadata: { roomAmount } }).catch(console.error);

    // Build human player data
    const humanPlayer = { 
      user: req.user._id.toString(),
      telegramId: updatedUser.telegramId,
      name: updatedUser.firstName || updatedUser.username || 'Player',
      isBot: false,
      cardGrid, 
      markedState 
    };
    
    // Find or create game session with only the human player initially
    let gameSession = await GameSession.findOne({ roomAmount, gameStatus: { $in: ['waiting', 'active'] } });
    
    if (!gameSession) {
      gameSession = await GameSession.create({ 
        roomAmount, 
        gameStatus: 'active',
        startedAt: new Date(),
        players: [humanPlayer]
      });
    } else {
      // SECURITY FIX: Check if player already in this session to prevent duplicates
      const existingPlayer = gameSession.players.find(p => p.user.toString() === req.user._id.toString());
      if (!existingPlayer) {
        gameSession.players.push(humanPlayer);
        if (gameSession.gameStatus === 'waiting') { 
          gameSession.gameStatus = 'active'; 
          gameSession.startedAt = new Date(); 
        }
        await gameSession.save();
      }
    }

    // BOT INJECTION CONTROL PLANE: Use deterministic injection table with strict limits
    const currentHumanCount = gameSession.players.filter(p => !p.isBot).length;
    
    // ANTI-FLOOD: Check if this room is already being processed
    const processingKey = `${roomAmount}_${req.user._id}`;
    if (roomProcessingState.get(processingKey)) {
      console.log(`⚠️ Anti-flood: User ${req.user._id} already processing join for room ${roomAmount}`);
      // Player already added, just return success without re-injecting bots
      const existingSession = await GameSession.findOne({ roomAmount, gameStatus: { $in: ['waiting', 'active'] } });
      return res.json({ 
        success: true, 
        game: { 
          sessionId: existingSession._id, 
          roomAmount, 
          currentPool: updatedRoomPool ? updatedRoomPool.currentPool : 0, 
          totalPrize: 0,
          playersCount: existingSession.players.length,
          humanPlayers: existingSession.players.filter(p => !p.isBot).length,
          botPlayers: existingSession.players.filter(p => p.isBot).length,
          cardGrid, 
          markedState, 
          calledNumbers: existingSession.calledNumbers, 
          botsAdded: 0,
          message: 'Already joined - no duplicate bot injection'
        } 
      });
    }
    
    // Set processing flag
    roomProcessingState.set(processingKey, true);
    
    // MILESTONE CAP: Calculate next milestone and enforce hard limit
    const currentTotalPlayers = gameSession.players.length;
    const nextMilestone = MILESTONE_CAPS.find(cap => cap > currentTotalPlayers) || MILESTONE_CAPS[MILESTONE_CAPS.length - 1];
    const maxPlayersAllowed = nextMilestone;
    
    // If room already at or beyond max milestone (28), stop all injection
    if (currentTotalPlayers >= 28) {
      console.log(`🛑 Milestone Cap: Room ${roomAmount} at maximum capacity (${currentTotalPlayers}/28). Stopping bot injection.`);
      roomProcessingState.delete(processingKey);
      const prizeCalculation = calculateAtomicPrize(currentHumanCount, roomAmount);
      return res.json({ 
        success: true, 
        game: { 
          sessionId: gameSession._id, 
          roomAmount, 
          currentPool: updatedRoomPool ? updatedRoomPool.currentPool : 0, 
          totalPrize: prizeCalculation.netPrizePool,
          playersCount: currentTotalPlayers,
          humanPlayers: currentHumanCount,
          botPlayers: gameSession.players.filter(p => p.isBot).length,
          cardGrid, 
          markedState, 
          calledNumbers: gameSession.calledNumbers, 
          botsAdded: 0,
          message: 'Room at maximum milestone capacity (28 players)'
        } 
      });
    }
    
    // Get injection plan from the control table
    let injectionPlan = getInjectionPlan(currentHumanCount);
    let botsNeeded = injectionPlan.botsToInject;
    
    // RESOURCE GUARD: Limit bots injected in single request to MAX_BOTS_PER_REQUEST
    if (botsNeeded > MAX_BOTS_PER_REQUEST) {
      console.log(`⚠️ Resource Guard: Capping bot injection from ${botsNeeded} to ${MAX_BOTS_PER_REQUEST}`);
      botsNeeded = MAX_BOTS_PER_REQUEST;
      injectionPlan.botsToInject = botsNeeded;
    }
    
    // MILESTONE ADJUSTMENT: Ensure we don't exceed the next milestone cap
    const maxBotsForMilestone = maxPlayersAllowed - currentTotalPlayers;
    if (botsNeeded > maxBotsForMilestone) {
      console.log(`⚠️ Milestone Cap: Reducing bot injection from ${botsNeeded} to ${maxBotsForMilestone} to stay under ${nextMilestone}`);
      botsNeeded = Math.max(0, maxBotsForMilestone);
      injectionPlan.botsToInject = botsNeeded;
    }
    
    let injectedBots = [];
    let totalPlayers = currentHumanCount;
    
    // Get already tracked bots for this room from the injection sheet
    const trackedBotsInRoom = getInjectedBotsInRoom(roomAmount);
    
    // Inject bots if needed according to the plan
    if (botsNeeded > 0) {
      // UNIQUE PARTICIPATION: Get available bots (exclude bots already in session AND already tracked AND in any active game)
      const existingBotIds = gameSession.players.filter(p => p.isBot).map(p => p.user);
      const allExcludedBotIds = new Set([...existingBotIds, ...trackedBotsInRoom]);
      
      // Find all active game sessions to exclude bots currently playing elsewhere
      const activeSessions = await GameSession.find({ gameStatus: 'active' }).select('players');
      const botsInActiveGames = new Set();
      activeSessions.forEach(session => {
        session.players.filter(p => p.isBot).forEach(botPlayer => {
          botsInActiveGames.add(botPlayer.user);
        });
      });
      
      // Query for available bots: not in this session, not tracked, not in other active games, isActive=true, has sufficient balance
      const availableBots = await Bot.find({ 
        telegramId: { $nin: Array.from(allExcludedBotIds) },
        _id: { $nin: Array.from(botsInActiveGames) },
        isActive: true,
        balance: { $gte: roomAmount }
      }).limit(botsNeeded);
      
      console.log(`🤖 Bot Injection Plan: ${currentHumanCount} humans → injecting ${availableBots.length} bots (requested: ${botsNeeded})`);
      
      // Process each bot: deduct balance and add to game session
      for (const bot of availableBots) {
        // Deduct bot balance (bot pays entry fee)
        await deductBotBalance(bot._id, roomAmount);
        
        // Use the bot's pre-generated card from database if available, otherwise generate new one
        let botCard, botMarked;
        if (bot.cardGrid && bot.cardGrid.length > 0 && bot.cardGrid[0].length > 0) {
          // Use existing card from bot's profile
          botCard = bot.cardGrid;
          botMarked = bot.markedState || Array(5).fill(null).map(() => Array(5).fill(false));
          botMarked[2][2] = true; // Ensure center is marked (free space)
        } else {
          // Generate new card if none exists
          const newCard = GameSession.generateCard();
          botCard = newCard.cardGrid;
          botMarked = newCard.markedState;
        }
        
        const botPlayer = {
          user: bot.telegramId,
          name: bot.name,
          isBot: true,
          cardGrid: botCard,
          markedState: botMarked
        };
        
        gameSession.players.push(botPlayer);
        injectedBots.push(bot);
        
        // Track this bot injection in the sheet
        trackBotInjection(roomAmount, bot.telegramId);
      }
      
      // Save game session with all players (humans + bots)
      await gameSession.save();
      
      totalPlayers = gameSession.players.length;
    } else {
      // No bots needed, but still count tracked bots as part of total players
      totalPlayers = currentHumanCount + trackedBotsInRoom.size;
    }
    
    // Clear processing flag after completion
    roomProcessingState.delete(processingKey);
    
    // ATOMIC PRIZE CALCULATION: Use the injection plane calculator
    // Prize pool MUST equal (entryFee * totalPlayers) * 0.85 where totalPlayers includes humans + injected bots
    const prizeCalculation = calculateAtomicPrize(currentHumanCount, roomAmount);
    const calculatedPrizePool = prizeCalculation.netPrizePool;
    
    // House gets 15% of total collected
    const totalCollected = roomAmount * prizeCalculation.totalPlayers;
    const houseCut = prizeCalculation.commission;
    
    // DATABASE SYNC: Use $set instead of $inc for currentPool to prevent doubling on refresh
    await RoomPool.findByIdAndUpdate(
      roomPool._id,
      { 
        $set: { 
          currentPool: calculatedPrizePool,
          houseTotal: houseCut 
        },
        $addToSet: { players: { telegramId: updatedUser.telegramId } }
      }
    );

    const updatedRoomPool = await RoomPool.findOne({ roomAmount });
    
    res.json({ 
      success: true, 
      game: { 
        sessionId: gameSession._id, 
        roomAmount, 
        currentPool: updatedRoomPool.currentPool, 
        totalPrize: calculatedPrizePool,
        playersCount: gameSession.players.length,
        humanPlayers: gameSession.players.filter(p => !p.isBot).length,
        botPlayers: injectedBots.length,
        cardGrid, 
        markedState, 
        calledNumbers: gameSession.calledNumbers, 
        botsAdded: injectedBots.length 
      } 
    });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

router.post('/mark', auth, async (req, res) => {
  try {
    // Admin users cannot play games (no real DB record)
    if (req.isAdminAuth) {
      return res.status(403).json({ error: 'Admin accounts cannot play games' });
    }
    
    const { sessionId, row, col } = req.body;
    
    // Validate coordinates first (fast fail)
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    // Use lean() for faster query, but we need to save later so don't use lean here
    const gameSession = await GameSession.findOne({ _id: sessionId, gameStatus: 'active' })
      .select('players calledNumbers gameStatus');
    if (!gameSession) return res.status(404).json({ error: 'Game not found or not active' });

    const player = gameSession.players.find(p => p.user === req.user._id.toString());
    if (!player) return res.status(403).json({ error: 'Not in this game' });
    
    const num = player.cardGrid[row][col];
    // Use Set for O(1) lookup instead of O(n) array includes
    const calledSet = new Set(gameSession.calledNumbers);
    if (!(row === 2 && col === 2) && !calledSet.has(num)) {
      return res.status(400).json({ error: 'Number not called yet' });
    }

    player.markedState[row][col] = !player.markedState[row][col];
    
    // Use updateOne instead of save() for better performance (only updates changed fields)
    await GameSession.updateOne(
      { _id: sessionId },
      { $set: { [`players.${gameSession.players.indexOf(player)}.markedState`]: player.markedState } }
    );

    const playerIndex = gameSession.players.indexOf(player);
    const winResult = gameSession.checkWin(playerIndex);
    
    // Process bot moves after human player marks
    await processBotMoves(gameSession);

    res.json({ success: true, marked: player.markedState[row][col], matches: player.markedState.flat().filter(Boolean).length - 1, win: winResult.win, pattern: winResult.pattern });
  } catch (err) {
    console.error('Mark number error:', err);
    res.status(500).json({ error: 'Failed to mark number' });
  }
});

/**
 * Process bot moves in the game session with improved error handling and card validation
 * This function is called after every callNumber() execution to activate bot play logic
 */
async function processBotMoves(gameSession) {
  const botPlayers = gameSession.players.filter(p => p.isBot);
  
  if (botPlayers.length === 0) return; // No bots to process
  
  console.log(`🤖 Processing ${botPlayers.length} bot moves...`);
  
  for (const botPlayer of botPlayers) {
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
      // Update player's card in session
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId);
      if (botIndex !== -1) {
        gameSession.players[botIndex].cardGrid = bot.cardGrid;
        gameSession.players[botIndex].markedState = bot.markedState;
      }
    }

    // Check win pattern logic: bots win 2 times in a row, then user wins 1 time
    // If consecutiveBotWins >= 2, skip bot winning to allow human to win
    const shouldLetBotWin = consecutiveBotWins < 2;
    
    // THE TRIGGER: Call simulateBotMove() for this bot
    const move = simulateBotMove(gameSession, bot);
    if (move) {
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId);
      if (botIndex !== -1) {
        // THE MARK: Update marked state in game session
        gameSession.players[botIndex].markedState[move.row][move.col] = true;
        
        console.log(`✅ Bot ${bot.name} marked position [${move.row},${move.col}] = ${move.num}`);
        
        // THE WIN CHECK: Run checkBotWin() after every mark
        const botWinResult = gameSession.checkWin(botIndex);
        if (botWinResult.win && shouldLetBotWin) {
          // Bot wins - handle payout sequence
          console.log(`🎉 Bot ${bot.name} WINS with pattern: ${botWinResult.pattern}!`);
          await handleBotWin(gameSession, bot, botIndex, botWinResult);
          return; // Exit after a bot wins
        } else if (botWinResult.win && !shouldLetBotWin) {
          // Bot would win but we need to let human win - unmark this move
          console.log(`⏸️ Bot ${bot.name} would win but human turn - unmarking move`);
          gameSession.players[botIndex].markedState[move.row][move.col] = false;
        }
      }
    }
  }
  
  // Save all bot marks to database
  if (gameSession.isModified && gameSession.isModified()) {
    await gameSession.save();
    console.log(`💾 Saved bot moves to database`);
  }
}

/**
 * Handle bot winning the game
 */
async function handleBotWin(gameSession, bot, playerIndex, winResult) {
  const roomAmount = gameSession.roomAmount;
  
  const roomPool = await RoomPool.findOneAndUpdate(
    { roomAmount: gameSession.roomAmount },
    { $set: { currentPool: 0, players: [] } },
    { new: true }
  );
  
  if (!roomPool) return;
  
  const winnings = roomPool.currentPool + (roomPool.houseTotal || 0);
  
  // Award winnings to bot
  await Bot.findByIdAndUpdate(bot._id, { 
    $inc: { balance: winnings, totalWins: 1, totalWinnings: winnings } 
  });
  
  gameSession.gameStatus = 'completed';
  gameSession.completedAt = new Date();
  gameSession.winner = bot.telegramId;
  gameSession.winnerName = bot.name;
  gameSession.winningPattern = winResult.pattern;
  gameSession.isBotWin = true;
  
  // Clear bot injection tracking for this room when game completes
  clearBotInjectionForRoom(roomAmount);
  
  // Update win tracking
  consecutiveBotWins++;
  lastWinnerWasBot = true;
  
  // Reset after 2 bot wins to allow human win next
  if (consecutiveBotWins >= 2) {
    consecutiveBotWins = 0;
  }
}

router.post('/claim', auth, async (req, res) => {
  try {
    // Admin users cannot claim wins (no real DB record)
    if (req.isAdminAuth) {
      return res.status(403).json({ error: 'Admin accounts cannot claim wins' });
    }
    
    const { sessionId } = req.body;
    const gameSession = await GameSession.findOne({ _id: sessionId, gameStatus: 'active' }).select('players roomAmount');
    if (!gameSession) return res.status(404).json({ error: 'Game not found' });

    const playerIndex = gameSession.players.findIndex(p => p.user === req.user._id.toString());
    if (playerIndex === -1) return res.status(403).json({ error: 'Not in this game' });
    
    const winResult = gameSession.checkWin(playerIndex);
    if (!winResult.win) return res.status(400).json({ error: 'No bingo pattern detected' });

    // Atomic update to reset pool and get current value
    const roomPool = await RoomPool.findOneAndUpdate(
      { roomAmount: gameSession.roomAmount },
      { $set: { currentPool: 0, players: [] } },
      { new: true }
    );
    
    if (!roomPool) return res.status(404).json({ error: 'Room pool not found' });
    
    const winnings = roomPool.currentPool + (roomPool.houseTotal || 0);

    // Get user info for name display
    const userInfo = await User.findById(req.user._id).select('firstName username telegramId');
    
    // Atomic balance update with projection
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { 
        $inc: { 
          balance: winnings, 
          totalWins: 1, 
          totalWinnings: winnings,
          gamesPlayed: 1 
        } 
      },
      { new: true, select: 'balance' }
    );

    // Create transaction asynchronously
    Transaction.create({ userId: req.user._id, type: 'winning', amount: winnings, status: 'completed' }).catch(console.error);
    
    gameSession.gameStatus = 'completed'; 
    gameSession.completedAt = new Date(); 
    gameSession.winner = req.user._id.toString();
    gameSession.winnerName = userInfo.firstName || userInfo.username || 'Player';
    gameSession.winningPattern = winResult.pattern;
    gameSession.isBotWin = false;
    await gameSession.save();
    
    // Clear bot injection tracking for this room when game completes (human win)
    clearBotInjectionForRoom(gameSession.roomAmount);
    
    // Reset bot win tracking after human win
    consecutiveBotWins = 0;
    lastWinnerWasBot = false;

    res.json({ 
      success: true, 
      winnings, 
      newBalance: updatedUser.balance, 
      pattern: winResult.pattern,
      winnerName: gameSession.winnerName
    });
  } catch (err) {
    console.error('Claim win error:', err);
    res.status(500).json({ error: 'Failed to claim win' });
  }
});

router.post('/number/:sessionId', auth, async (req, res) => {
  try {
    // Admin users cannot play games (no real DB record)
    if (req.isAdminAuth) {
      return res.status(403).json({ error: 'Admin accounts cannot play games' });
    }
    
    const gameSession = await GameSession.findOne({ _id: req.params.sessionId, gameStatus: 'active' })
      .select('players calledNumbers gameStatus currentNumber');
    if (!gameSession) return res.status(404).json({ error: 'Game not found or not active' });
    
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
    gameSession.calledNumbers.push(nextNumber);
    gameSession.currentNumber = nextNumber;
    await gameSession.save();
    
    const letter = ['B','I','N','G','O'][Math.floor((nextNumber - 1) / 15)];
    const display = `${letter}-${nextNumber}`;
    
    // TRIGGER BOT MOVES: After calling a number, all bots check for matches and mark
    await processBotMoves(gameSession);
    
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
