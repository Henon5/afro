const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');

router.post('/verify', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ 
      success: true, 
      user: { 
        id: user._id, 
        telegramId: user.telegramId, 
        displayName: user.displayName, 
        firstName: user.firstName,
        username: user.username,
        phone: user.phone,
        telegramHandle: user.telegramHandle,
        balance: user.balance, 
        gamesPlayed: user.gamesPlayed || 0,
        totalWins: user.totalWins || 0, 
        isBlocked: user.isBlocked 
      } 
    });
  } catch (err) {
    console.error('Auth verify error:', err);
    res.status(500).json({ error: 'Failed to verify user' });
  }
});

module.exports = router;
