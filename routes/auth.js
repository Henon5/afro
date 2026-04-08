const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');

router.post('/verify', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user: { id: user._id, telegramId: user.telegramId, displayName: user.displayName, balance: user.balance, totalWins: user.totalWins, isBlocked: user.isBlocked } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify user' });
  }
});

module.exports = router;
