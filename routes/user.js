const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');

// GET /api/user - Get current user profile (requires auth)
router.get('/', auth, async (req, res) => {
  try {
    // Use projection to only fetch needed fields (performance optimization)
    const user = await User.findById(req.user._id).select('username firstName phone telegramHandle balance gamesPlayed totalWins createdAt');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ 
      success: true, 
      user: { 
        _id: user._id,
        displayName: user.firstName || user.username || user.telegramHandle || 'Player', 
        username: user.username || '',
        firstName: user.firstName || '',
        phone: user.phone || '', 
        telegramHandle: user.telegramHandle || '',
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
    const updates = {};
    
    // Only update fields that are provided and not empty/null in the request
    if (req.body.name !== undefined && req.body.name !== null && req.body.name !== '') {
      updates.firstName = req.body.name;
    }
    if (req.body.username !== undefined && req.body.username !== null && req.body.username !== '') {
      updates.username = req.body.username;
    }
    if (req.body.phone !== undefined && req.body.phone !== null && req.body.phone !== '') {
      updates.phone = req.body.phone;
    }
    if (req.body.telegramHandle !== undefined && req.body.telegramHandle !== null && req.body.telegramHandle !== '') {
      updates.telegramHandle = req.body.telegramHandle;
    }
    
    // Always update lastActive
    updates.lastActive = Date.now();
    
    // If no valid updates, return current user data without changes
    if (Object.keys(updates).length === 1 && updates.lastActive) {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({ 
        success: true, 
        message: 'No changes to update',
        user: { 
          displayName: user.firstName || user.username || user.telegramHandle || 'Player', 
          username: user.username || '',
          firstName: user.firstName || '',
          phone: user.phone || '', 
          telegramHandle: user.telegramHandle || '',
          gamesPlayed: user.gamesPlayed || 0,
          totalWins: user.totalWins || 0
        } 
      });
    }
    
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ 
      success: true, 
      user: { 
        displayName: user.firstName || user.username || user.telegramHandle || 'Player', 
        username: user.username || '',
        firstName: user.firstName || '',
        phone: user.phone || '', 
        telegramHandle: user.telegramHandle || '',
        gamesPlayed: user.gamesPlayed || 0,
        totalWins: user.totalWins || 0
      } 
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code,
      keyValue: err.keyValue
    });
    res.status(500).json({ error: 'Failed to update profile', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

// PUT method (preferred)
router.put('/profile', auth, validate('updateProfile'), async (req, res) => {
  try {
    const updates = {};
    
    // Only update fields that are provided and not empty/null in the request
    if (req.body.name !== undefined && req.body.name !== null && req.body.name !== '') {
      updates.firstName = req.body.name;
    }
    if (req.body.username !== undefined && req.body.username !== null && req.body.username !== '') {
      updates.username = req.body.username;
    }
    if (req.body.phone !== undefined && req.body.phone !== null && req.body.phone !== '') {
      updates.phone = req.body.phone;
    }
    if (req.body.telegramHandle !== undefined && req.body.telegramHandle !== null && req.body.telegramHandle !== '') {
      updates.telegramHandle = req.body.telegramHandle;
    }
    
    // Always update lastActive
    updates.lastActive = Date.now();
    
    // Debug logging
    console.log('Profile update request:', {
      userId: req.user._id,
      updates: Object.keys(updates),
      hasName: !!updates.firstName,
      hasUsername: !!updates.username,
      hasPhone: !!updates.phone
    });
    
    // If no valid updates, return current user data without changes
    if (Object.keys(updates).length === 1 && updates.lastActive) {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({ 
        success: true, 
        message: 'No changes to update',
        user: { 
          displayName: user.firstName || user.username || user.telegramHandle || 'Player', 
          username: user.username || '',
          firstName: user.firstName || '',
          phone: user.phone || '', 
          telegramHandle: user.telegramHandle || '',
          gamesPlayed: user.gamesPlayed || 0,
          totalWins: user.totalWins || 0
        } 
      });
    }
    
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ 
      success: true, 
      user: { 
        displayName: user.firstName || user.username || user.telegramHandle || 'Player', 
        username: user.username || '',
        firstName: user.firstName || '',
        phone: user.phone || '', 
        telegramHandle: user.telegramHandle || '',
        gamesPlayed: user.gamesPlayed || 0,
        totalWins: user.totalWins || 0
      } 
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code,
      keyValue: err.keyValue
    });
    res.status(500).json({ error: 'Failed to update profile', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

module.exports = router;