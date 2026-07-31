const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');
const GameSession = require('../models/GameSession');
const Transaction = require('../models/Transaction');

/**
 * POST /api/cartel/select
 * Select a lucky number and join a game room
 */
router.post('/select', auth, async (req, res) => {
  try {
    const { number, roomAmount } = req.body;
    
    // Validate number is between 1-75
    if (!number || number < 1 || number > 75) {
      return res.status(400).json({ error: 'Invalid number. Please select a number between 1-75.' });
    }
    
    // Validate room amount
    if (!roomAmount || typeof roomAmount !== 'number') {
      return res.status(400).json({ error: 'Invalid room amount' });
    }
    
    // Check user balance
    const user = await User.findById(req.user._id).select('balance telegramId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.balance < roomAmount) {
      return res.status(400).json({ error: 'Insufficient balance to join this room' });
    }
    
    // Use atomic update to prevent race conditions
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { balance: -roomAmount } },
      { new: true, select: 'balance telegramId' }
    );
    
    if (updatedUser.balance < 0) {
      // Rollback the deduction
      await User.findByIdAndUpdate(req.user._id, { $inc: { balance: roomAmount } });
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
    
    // Generate bingo card with the selected lucky number highlighted
    const { cardGrid, markedState } = GameSession.generateCard();

    // Create transaction asynchronously (non-blocking)
    Transaction.create({ 
      userId: req.user._id, 
      type: 'game_entry', 
      amount: -roomAmount, 
      status: 'completed', 
      metadata: { roomAmount, selectedNumber: number } 
    }).catch(console.error);

    // Atomic updates for room pool
    await RoomPool.findByIdAndUpdate(
      roomPool._id,
      { 
        $inc: { currentPool: poolContribution, houseTotal: houseContribution },
        $addToSet: { players: { telegramId: updatedUser.telegramId, selectedNumber: number } }
      }
    );

    // Find or create game session
    let gameSession = await GameSession.findOne({ 
      roomAmount, 
      gameStatus: { $in: ['waiting', 'active'] } 
    });
    
    if (!gameSession) {
      gameSession = await GameSession.create({ 
        roomAmount, 
        gameStatus: 'active',
        startedAt: new Date(),
        players: [{ 
          user: req.user._id, 
          cardGrid, 
          markedState,
          selectedNumber: number
        }]
      });
    } else {
      gameSession.players.push({ 
        user: req.user._id, 
        cardGrid, 
        markedState,
        selectedNumber: number
      });
      if (gameSession.gameStatus === 'waiting') { 
        gameSession.gameStatus = 'active'; 
        gameSession.startedAt = new Date(); 
      }
      await gameSession.save();
    }

    const updatedRoomPool = await RoomPool.findOne({ roomAmount });
    
    res.json({ 
      success: true, 
      message: `Number ${number} selected successfully!`,
      selectedNumber: number,
      game: { 
        sessionId: gameSession._id, 
        roomAmount, 
        currentPool: updatedRoomPool.currentPool, 
        playersCount: updatedRoomPool.players.length, 
        cardGrid, 
        markedState, 
        calledNumbers: gameSession.calledNumbers 
      } 
    });
  } catch (err) {
    console.error('Cartel select error:', err);
    res.status(500).json({ error: 'Failed to select number and join game' });
  }
});

/**
 * GET /api/cartel/rooms
 * Get available rooms for cartel selection
 */
router.get('/rooms', auth, async (req, res) => {
  try {
    const rooms = await RoomPool.find().select('roomAmount currentPool houseTotal players');
    const map = {};
    rooms.forEach(r => {
      map[r.roomAmount] = { 
        pool: r.currentPool, 
        players: r.players.length,
        houseTotal: r.houseTotal
      };
    });
    res.json({ success: true, rooms: map });
  } catch (err) {
    console.error('Fetch cartel rooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

module.exports = router;
