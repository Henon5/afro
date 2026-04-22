const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');

// GET /api/user - Get current user profile (requires auth)
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ 
      success: true, 
      user: { 
        _id: user._id,
        displayName: user.displayName, 
        username: user.username,
        firstName: user.firstName,
        phone: user.phone, 
        telegramHandle: user.telegramHandle,
        balance: user.balance,
        gamesPlayed: user.gamesPlayed || 0,
        totalWins: user.totalWins || 0,
        createdAt: user.createdAt
      } 
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// POST method (legacy support)
router.post('/profile', auth, validate('updateProfile'), async (req, res) => {
  try {
    const updates = { 
      firstName: req.body.name || req.user.firstName, 
      username: req.body.username || req.user.username,
      phone: req.body.phone || req.user.phone, 
      telegramHandle: req.body.telegramHandle || req.user.telegramHandle, 
      lastActive: Date.now() 
    };
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ 
      success: true, 
      user: { 
        displayName: user.displayName, 
        username: user.username,
        firstName: user.firstName,
        phone: user.phone, 
        telegramHandle: user.telegramHandle,
        gamesPlayed: user.gamesPlayed || 0,
        totalWins: user.totalWins || 0
      } 
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT method (preferred)
router.put('/profile', auth, validate('updateProfile'), async (req, res) => {
  try {
    const updates = { 
      firstName: req.body.name || req.user.firstName, 
      username: req.body.username || req.user.username,
      phone: req.body.phone || req.user.phone, 
      telegramHandle: req.body.telegramHandle || req.user.telegramHandle, 
      lastActive: Date.now() 
    };
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ 
      success: true, 
      user: { 
        displayName: user.displayName, 
        username: user.username,
        firstName: user.firstName,
        phone: user.phone, 
        telegramHandle: user.telegramHandle,
        gamesPlayed: user.gamesPlayed || 0,
        totalWins: user.totalWins || 0
      } 
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;