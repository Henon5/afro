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

// POST method (legacy support)
router.post('/profile', auth, validate('updateProfile'), async (req, res) => {
  try {
    // Debug logging - FIRST thing to log
    console.log("📝 Attempting to save profile for user:", req.user._id);
    console.log("📝 Data received:", JSON.stringify(req.body));
    console.log("📝 User object:", JSON.stringify({ 
      _id: req.user._id, 
      telegramId: req.user.telegramId,
      isAdminAuth: req.isAdminAuth,
      isAdmin: req.user.isAdmin
    }));
    
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
    console.log('📝 Profile update request (POST):', {
      userId: req.user._id,
      userType: 'telegram',
      updates: Object.keys(updates).filter(k => k !== 'lastActive'),
      hasName: !!updates.firstName,
      hasUsername: !!updates.username,
      hasPhone: !!updates.phone
    });
    
    // If no valid updates, return current user data without changes
    if (Object.keys(updates).length === 1 && updates.lastActive) {
      const user = await User.findById(req.user._id);
      if (!user) {
        console.error('❌ User not found in DB:', req.user._id);
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
    
    console.log('🔄 Updating user (POST):', req.user._id, 'with fields:', Object.keys(updates).filter(k => k !== 'lastActive'));
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    if (!user) {
      console.error('❌ Failed to update user - not found:', req.user._id);
      return res.status(404).json({ error: 'User not found' });
    }
    console.log('✅ User updated successfully (POST):', user._id);
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
    console.error('❌ Error updating profile (POST):', err);
    console.error('Error details:', {
      message: err.message,
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
    // Debug logging - FIRST thing to log
    console.log("📝 Attempting to save profile for user (PUT):", req.user._id);
    console.log("User ID:", req.user?._id);
    console.log("📝 Data received:", JSON.stringify(req.body));
    console.log("📝 User object:", JSON.stringify({ 
      _id: req.user._id, 
      telegramId: req.user.telegramId,
      isAdminAuth: req.isAdminAuth,
      isAdmin: req.user.isAdmin
    }));
    
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
    console.log('📝 Profile update request (PUT):', {
      userId: req.user._id,
      userType: 'telegram',
      updates: Object.keys(updates).filter(k => k !== 'lastActive'),
      hasName: !!updates.firstName,
      hasUsername: !!updates.username,
      hasPhone: !!updates.phone
    });
    
    // If no valid updates, return current user data without changes
    if (Object.keys(updates).length === 1 && updates.lastActive) {
      const user = await User.findById(req.user._id);
      if (!user) {
        console.error('❌ User not found in DB:', req.user._id);
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
    
    console.log('🔄 Updating user (PUT):', req.user._id, 'with fields:', Object.keys(updates).filter(k => k !== 'lastActive'));
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    if (!user) {
      console.error('❌ Failed to update user - not found:', req.user._id);
      return res.status(404).json({ error: 'User not found' });
    }
    console.log('✅ User updated successfully (PUT):', user._id);
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
    console.error('❌ Error updating profile (PUT):', err);
    console.error('Error details:', {
      message: err.message,
      name: err.name,
      code: err.code,
      keyValue: err.keyValue
    });
    res.status(500).json({ error: 'Failed to update profile', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
  }
});

module.exports = router;