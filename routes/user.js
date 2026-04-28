const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');

// GET /api/user - Get current user profile (requires auth)
router.get('/', auth, async (req, res) => {
  try {
    // Admin users authenticated via token don't have a real DB record
    if (req.isAdminAuth) {
      return res.json({ 
        success: true, 
        user: { 
          _id: req.user._id,
          displayName: req.user.displayName || 'Admin', 
          username: 'admin',
          firstName: 'Admin',
          phone: '', 
          telegramHandle: '',
          isAdmin: true,
          balance: 0,
          gamesPlayed: 0,
          totalWins: 0,
          createdAt: new Date()
        } 
      });
    }
    
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

// PUT method (preferred)
router.put('/profile', auth, validate('updateProfile'), async (req, res) => {
  try {
    // If req.user._id === 'admin', return 403
    if (req.user._id === 'admin') {
      console.warn('⚠️ Admin user attempted to update profile');
      return res.status(403).json({ error: 'Admin cannot have a player profile' });
    }
    
    // Admin users authenticated via token cannot update profile (no DB record)
    if (req.isAdminAuth) {
      console.warn('⚠️ Admin attempted to update profile');
      return res.status(403).json({ error: 'Admin profiles cannot be updated via this endpoint' });
    }
    
    // Validate that req.user._id is a valid ObjectId format (not 'admin' string or invalid ID)
    const mongoose = require('mongoose');
    if (!req.user._id || !mongoose.Types.ObjectId.isValid(req.user._id)) {
      console.error('❌ Invalid user ID for profile update:', req.user._id);
      return res.status(400).json({ error: 'Invalid user authentication - please log in again' });
    }
    
    // Use await User.findByIdAndUpdate with $set
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id, 
      { $set: req.body }, 
      { new: true }
    );
    
    if (!updatedUser) {
      console.error('❌ User not found in DB after update:', req.user._id);
      return res.status(404).json({ error: 'User not found' });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: {
        displayName: updatedUser.firstName || updatedUser.username || updatedUser.telegramHandle || 'Player',
        username: updatedUser.username || '',
        firstName: updatedUser.firstName || '',
        phone: updatedUser.phone || '',
        telegramHandle: updatedUser.telegramHandle || '',
        balance: updatedUser.balance,
        telegramId: updatedUser.telegramId
      }
    });
  } catch (err) {
    console.error('❌ Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;