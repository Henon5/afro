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
    const rooms = await RoomPool.find();
    const map = {};
    rooms.forEach(r => map[r.roomAmount] = { pool: r.currentPool, players: r.players.length });
    res.json({ success: true, rooms: map });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

router.post('/join', auth, validate('joinRoom'), async (req, res) => {
  try {
    const { roomAmount } = req.body;
    const user = await User.findById(req.user._id);
    if (user.balance < roomAmount) return res.status(400).json({ error: 'Insufficient balance' });

    let roomPool = await RoomPool.findOne({ roomAmount });
    if (!roomPool) roomPool = await RoomPool.create({ roomAmount });

    const poolContribution = Math.floor(roomAmount * (1 - parseFloat(process.env.HOUSE_COMMISSION)));
    const houseContribution = roomAmount - poolContribution;
    const { cardGrid, markedState } = GameSession.generateCard();

    user.balance -= roomAmount;
    await user.save();
    await Transaction.create({ userId: user._id, type: 'game_entry', amount: -roomAmount, status: 'completed', metadata: { roomAmount } });

    roomPool.currentPool += poolContribution;
    roomPool.houseTotal += houseContribution;
    if (!roomPool.players.some(p => p.telegramId === user.telegramId)) roomPool.players.push({ telegramId: user.telegramId });
    await roomPool.save();

    let gameSession = await GameSession.findOne({ roomAmount, gameStatus: { $in: ['waiting', 'active'] } });
    if (!gameSession) gameSession = await GameSession.create({ roomAmount, gameStatus: 'waiting' });
    
    gameSession.players.push({ user: user._id, cardGrid, markedState });
    if (gameSession.gameStatus === 'waiting') { gameSession.gameStatus = 'active'; gameSession.startedAt = new Date(); }
    await gameSession.save();

    res.json({ success: true, game: { sessionId: gameSession._id, roomAmount, currentPool: roomPool.currentPool, playersCount: roomPool.players.length, cardGrid, markedState, calledNumbers: gameSession.calledNumbers } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to join room' });
  }
});

router.post('/mark', auth, async (req, res) => {
  try {
    const { sessionId, row, col } = req.body;
    const gameSession = await GameSession.findOne({ _id: sessionId, gameStatus: 'active' });
    if (!gameSession) return res.status(404).json({ error: 'Game not found or not active' });

    const player = gameSession.players.find(p => p.user === req.user._id);
    if (!player) return res.status(403).json({ error: 'Not in this game' });
    
    // Validate row and col are within bounds
    if (row < 0 || row > 2 || col < 0 || col > 2) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }
    
    const num = player.cardGrid[row][col];
    if (!(row === 2 && col === 2) && !gameSession.calledNumbers.includes(num)) {
      return res.status(400).json({ error: 'Number not called yet' });
    }

    player.markedState[row][col] = !player.markedState[row][col];
    await gameSession.save();

    const playerIndex = gameSession.players.indexOf(player);
    const winResult = gameSession.checkWin(playerIndex);
    res.json({ success: true, marked: player.markedState[row][col], matches: player.markedState.flat().filter(Boolean).length - 1, win: winResult.win, pattern: winResult.pattern });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark number' });
  }
});

router.post('/claim', auth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const gameSession = await GameSession.findOne({ _id: sessionId, gameStatus: 'active' });
    if (!gameSession) return res.status(404).json({ error: 'Game not found' });

    const playerIndex = gameSession.players.findIndex(p => p.user === req.user._id);
    const winResult = gameSession.checkWin(playerIndex);
    if (!winResult.win) return res.status(400).json({ error: 'No bingo pattern detected' });

    const roomPool = await RoomPool.findOne({ roomAmount: gameSession.roomAmount });
    const winnings = roomPool.currentPool;
    
    // Use atomic updates to prevent race conditions
    await RoomPool.updateOne(
      { _id: roomPool._id },
      { $set: { currentPool: 0, players: [] } }
    );

    // Atomic balance update
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
      { new: true }
    );

    await Transaction.create({ userId: req.user._id, type: 'winning', amount: winnings, status: 'completed' });
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
    const gameSession = await GameSession.findOne({ _id: req.params.sessionId, gameStatus: 'active' });
    if (!gameSession) return res.status(404).json({ error: 'Game not found' });
    const available = Array.from({ length: 75 }, (_, i) => i + 1).filter(n => !gameSession.calledNumbers.includes(n));
    if (available.length === 0) return res.json({ success: true, number: null, complete: true });
    const nextNumber = available[Math.floor(Math.random() * available.length)];
    gameSession.calledNumbers.push(nextNumber);
    gameSession.currentNumber = nextNumber;
    await gameSession.save();
    const letter = ['B','I','N','G','O'][Math.floor((nextNumber - 1) / 15)];
    res.json({ success: true, number: nextNumber, display: `${letter}-${nextNumber}`, callCount: gameSession.calledNumbers.length, complete: available.length <= 1 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get number' });
  }
});

module.exports = router;
