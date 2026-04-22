const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');
const GameSession = require('../models/GameSession');
const Transaction = require('../models/Transaction');

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

router.post('/join', auth, validate('joinRoom'), async (req, res) => {
  try {
    const { roomAmount } = req.body;
    
    // SECURITY FIX: Use atomic update with condition to prevent race conditions and double-spending
    const updatedUser = await User.findOneAndUpdate(
      { 
        _id: req.user._id,
        balance: { $gte: roomAmount } // Condition: must have sufficient balance
      },
      { $inc: { balance: -roomAmount } },
      { new: true, select: 'balance telegramId' }
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

    const poolContribution = Math.floor(roomAmount * (1 - parseFloat(process.env.HOUSE_COMMISSION || '0.1')));
    const houseContribution = roomAmount - poolContribution;
    const { cardGrid, markedState } = GameSession.generateCard();

    // Create transaction asynchronously (non-blocking)
    Transaction.create({ userId: req.user._id, type: 'game_entry', amount: -roomAmount, status: 'completed', metadata: { roomAmount } }).catch(console.error);

    // SECURITY FIX: Atomic updates for room pool with $addToSet to prevent duplicate players
    await RoomPool.findByIdAndUpdate(
      roomPool._id,
      { 
        $inc: { currentPool: poolContribution, houseTotal: houseContribution },
        $addToSet: { players: { telegramId: updatedUser.telegramId } }
      }
    );

    // Find or create game session
    let gameSession = await GameSession.findOne({ roomAmount, gameStatus: { $in: ['waiting', 'active'] } });
    if (!gameSession) {
      gameSession = await GameSession.create({ 
        roomAmount, 
        gameStatus: 'active',
        startedAt: new Date(),
        players: [{ user: req.user._id, cardGrid, markedState }]
      });
    } else {
      // SECURITY FIX: Check if player already in this session to prevent duplicates
      const existingPlayer = gameSession.players.find(p => p.user.toString() === req.user._id.toString());
      if (!existingPlayer) {
        gameSession.players.push({ user: req.user._id, cardGrid, markedState });
        if (gameSession.gameStatus === 'waiting') { 
          gameSession.gameStatus = 'active'; 
          gameSession.startedAt = new Date(); 
        }
        await gameSession.save();
      }
    }

    const updatedRoomPool = await RoomPool.findOne({ roomAmount });
    res.json({ success: true, game: { sessionId: gameSession._id, roomAmount, currentPool: updatedRoomPool.currentPool, playersCount: updatedRoomPool.players.length, cardGrid, markedState, calledNumbers: gameSession.calledNumbers } });
  } catch (err) {
    console.error('Join room error:', err);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

router.post('/mark', auth, async (req, res) => {
  try {
    const { sessionId, row, col } = req.body;
    
    // Validate coordinates first (fast fail)
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    const gameSession = await GameSession.findOne({ _id: sessionId, gameStatus: 'active' }).select('players calledNumbers gameStatus');
    if (!gameSession) return res.status(404).json({ error: 'Game not found or not active' });

    const player = gameSession.players.find(p => p.user === req.user._id);
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
    res.json({ success: true, marked: player.markedState[row][col], matches: player.markedState.flat().filter(Boolean).length - 1, win: winResult.win, pattern: winResult.pattern });
  } catch (err) {
    console.error('Mark number error:', err);
    res.status(500).json({ error: 'Failed to mark number' });
  }
});

router.post('/claim', auth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const gameSession = await GameSession.findOne({ _id: sessionId, gameStatus: 'active' }).select('players roomAmount');
    if (!gameSession) return res.status(404).json({ error: 'Game not found' });

    const playerIndex = gameSession.players.findIndex(p => p.user === req.user._id);
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
    gameSession.winner = req.user._id; 
    gameSession.winningPattern = winResult.pattern;
    await gameSession.save();

    res.json({ success: true, winnings, newBalance: updatedUser.balance, pattern: winResult.pattern });
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

module.exports = router;
