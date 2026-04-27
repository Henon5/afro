const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');
const GameSession = require('../models/GameSession');
const Transaction = require('../models/Transaction');
const Bot = require('../models/Bot');
const { initializeBots, simulateBotMove, checkBotWin } = require('../utils/botManager');

// Track consecutive wins for the win pattern logic
let consecutiveBotWins = 0;
let lastWinnerWasBot = false;

router.get('/rooms', auth, async (req, res) => {
  try {
    const rooms = await RoomPool.find().select('roomAmount currentPool houseTotal players');
    const map = {};
    rooms.forEach(r => map[r.roomAmount] = { pool: r.currentPool, players: r.players.length });
    res.json({ success: true, rooms: map });
  } catch (err) {
    console.error('Fetch rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Initialize bots endpoint (admin only)
router.post('/bots/init', auth, async (req, res) => {
  try {
    if (!req.isAdminAuth) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await initializeBots();
    const botCount = await Bot.countDocuments();
    res.json({ success: true, message: 'Bots initialized', count: botCount });
  } catch (err) {
    console.error('Init bots error:', err);
    res.status(500).json({ error: 'Failed to initialize bots' });
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

    // Find or create game session and add bots first to calculate total pool contribution
    // Target an even number of total players (e.g., 8, 10, 12, 14) for clean pool calculation
    const possibleTotals = [8, 10, 12, 14];
    const targetTotalPlayers = possibleTotals[Math.floor(Math.random() * possibleTotals.length)];
    
    // We have 1 human player, so we need (target - 1) bots
    let botsNeeded = targetTotalPlayers - 1;
    if (botsNeeded < 0) botsNeeded = 0;
    
    const availableBots = await Bot.find({ 
      isActive: true, 
      balance: { $gte: roomAmount } 
    }).limit(botsNeeded);
    
    // Calculate total players (human + bots) for pool multiplication
    const totalPlayers = 1 + availableBots.length;
    
    // Calculate pool using strict formula: (entryFee × totalPlayers) × 0.85
    // Human contributes: roomAmount × 0.85 (after 15% house cut)
    // Each bot contributes: roomAmount × 0.85 (after 15% house cut)
    const humanPoolContribution = Math.floor(roomAmount * 0.85); // Human's share after 15% cut
    const botPoolContributions = availableBots.length * Math.floor(roomAmount * 0.85); // Bots' share after 15% cut
    const totalPoolContribution = humanPoolContribution + botPoolContributions;
    
    // House gets 15% from each player
    const houseContribution = roomAmount - humanPoolContribution;
    const botHouseContributions = availableBots.length * (roomAmount - Math.floor(roomAmount * 0.85));
    const totalHouseContribution = houseContribution + botHouseContributions;
    
    // Total bot contributions to pool for atomic update
    const botContributions = botPoolContributions;
    
    // Final pool contribution value for the human player
    const poolContribution = humanPoolContribution;
    
    // Deduct bot balances and prepare player data
    const botPlayersData = [];
    for (const bot of availableBots) {
      const botCard = GameSession.generateCard();
      botPlayersData.push({ 
        user: bot.telegramId, 
        telegramId: bot.telegramId,
        name: bot.name,
        isBot: true,
        cardGrid: botCard.cardGrid, 
        markedState: botCard.markedState 
      });
      // Deduct bot balance - bot contributes entry fee to pool
      await Bot.findByIdAndUpdate(bot._id, { 
        $inc: { balance: -roomAmount, gamesPlayed: 1 } 
      });
    }

    // SECURITY FIX: Atomic updates for room pool with $addToSet to prevent duplicate players
    // Include human + all bot contributions to the pool
    // Human contributes: poolContribution (after house cut)
    // Each bot contributes: full roomAmount to pool (multiplication system)
    await RoomPool.findByIdAndUpdate(
      roomPool._id,
      { 
        $inc: { 
          currentPool: poolContribution + botContributions, 
          houseTotal: houseContribution + botHouseContributions 
        },
        $addToSet: { players: { telegramId: updatedUser.telegramId } }
      }
    );

    // Find or create game session
    let gameSession = await GameSession.findOne({ roomAmount, gameStatus: { $in: ['waiting', 'active'] } });
    
    // Build initial players array with human player first
    const humanPlayer = { 
      user: req.user._id.toString(),
      telegramId: updatedUser.telegramId,
      name: updatedUser.firstName || updatedUser.username || 'Player',
      isBot: false,
      cardGrid, 
      markedState 
    };
    const playersArray = [humanPlayer, ...botPlayersData];
    
    if (!gameSession) {
      gameSession = await GameSession.create({ 
        roomAmount, 
        gameStatus: 'active',
        startedAt: new Date(),
        players: playersArray
      });
    } else {
      // SECURITY FIX: Check if player already in this session to prevent duplicates
      const existingPlayer = gameSession.players.find(p => p.user.toString() === req.user._id.toString());
      if (!existingPlayer) {
        gameSession.players.push(...playersArray);
        if (gameSession.gameStatus === 'waiting') { 
          gameSession.gameStatus = 'active'; 
          gameSession.startedAt = new Date(); 
        }
        await gameSession.save();
      }
    }

    const updatedRoomPool = await RoomPool.findOne({ roomAmount });
    const actualBotCount = availableBots.length;
    res.json({ 
      success: true, 
      game: { 
        sessionId: gameSession._id, 
        roomAmount, 
        currentPool: updatedRoomPool.currentPool, 
        playersCount: gameSession.players.length,
        humanPlayers: gameSession.players.filter(p => !p.isBot).length,
        botPlayers: actualBotCount,
        cardGrid, 
        markedState, 
        calledNumbers: gameSession.calledNumbers, 
        botsAdded: actualBotCount 
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
    
    const gameSession = await GameSession.findOne({ _id: sessionId, gameStatus: 'active' }).select('players calledNumbers gameStatus');
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
    await gameSession.save();

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
 * Process bot moves in the game session
 */
async function processBotMoves(gameSession) {
  const botPlayers = gameSession.players.filter(p => p.isBot);
  
  for (const botPlayer of botPlayers) {
    const bot = await Bot.findOne({ telegramId: botPlayer.user });
    if (!bot) continue;

    // Check win pattern logic: bots win 2 times in a row, then user wins 1 time
    // If consecutiveBotWins >= 2, skip bot winning to allow human to win
    const shouldLetBotWin = consecutiveBotWins < 2;
    
    const move = simulateBotMove(gameSession, bot);
    if (move) {
      const botIndex = gameSession.players.findIndex(p => p.user === bot.telegramId);
      if (botIndex !== -1) {
        gameSession.players[botIndex].markedState[move.row][move.col] = true;
        
        // Check if bot wins
        const botWinResult = gameSession.checkWin(botIndex);
        if (botWinResult.win && shouldLetBotWin) {
          // Bot wins - handle payout
          await handleBotWin(gameSession, bot, botIndex, botWinResult);
          return; // Exit after a bot wins
        } else if (botWinResult.win && !shouldLetBotWin) {
          // Bot would win but we need to let human win - unmark this move
          gameSession.players[botIndex].markedState[move.row][move.col] = false;
        }
      }
    }
  }
  
  if (gameSession.isModified()) {
    await gameSession.save();
  }
}

/**
 * Handle bot winning the game
 */
async function handleBotWin(gameSession, bot, playerIndex, winResult) {
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

router.get('/number/:sessionId', auth, async (req, res) => {
  try {
    const gameSession = await GameSession.findOne({ _id: req.params.sessionId, gameStatus: 'active' }).select('calledNumbers gameStatus');
    if (!gameSession) return res.status(404).json({ error: 'Game not found' });
    
    // Fast path: check if all numbers called
    if (gameSession.calledNumbers.length >= 75) {
      return res.json({ success: true, number: null, complete: true });
    }
    
    // Generate available numbers efficiently using Set for O(1) lookup
    const calledSet = new Set(gameSession.calledNumbers);
    const available = [];
    for (let i = 1; i <= 75; i++) {
      if (!calledSet.has(i)) available.push(i);
    }
    
    if (available.length === 0) return res.json({ success: true, number: null, complete: true });
    
    const nextNumber = available[Math.floor(Math.random() * available.length)];
    gameSession.calledNumbers.push(nextNumber);
    gameSession.currentNumber = nextNumber;
    await gameSession.save();
    
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
