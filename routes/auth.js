const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyTelegramWebAppData = require('../middleware/auth');

// Sync/Create user from Telegram
router.post('/sync', verifyTelegramWebAppData, async (req, res) => {
  try {
    const tgUser = req.telegramUser;
    if (!tgUser?.id) {
      return res.status(400).json({ error: 'Invalid user data' });
    }

    // Find or create user
    let user = await User.findOne({ telegramId: tgUser.id.toString() });
    
    const updateData = {
      firstName: tgUser.first_name || 'Player',
      lastName: tgUser.last_name,
      username: tgUser.username,
      lastActive: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    };

    if (user) {
      // Update existing user
      user = await User.findByIdAndUpdate(
        user._id,
        { $set: updateData },
        { new: true, runValidators: true }
      );
    } else {
      // Create new user
      user = await User.create({
        telegramId: tgUser.id.toString(),
        ...updateData,
        balance: 0,
        selectedRoom: 20
      });
    }

    // Return sanitized user data
    res.json({
      success: true,
      user: {
        id: user._id,
        name: ${user.firstName} ${user.lastName || ''}.trim(),
        phone: user.phone,
        telegram: user.telegramHandle,
        balance: user.balance,
        selectedRoom: user.selectedRoom,
        totalWins: user.totalWins,
        totalWinnings: user.totalWinnings,
        gamesPlayed: user.gamesPlayed,
        isBlocked: user.isBlocked
      }
    });
  } catch (error) {
    console.error('User sync error:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

// Update profile
router.put('/profile', verifyTelegramWebAppData, async (req, res) => {
  try {
    const { phone, telegram } = req.body;
    const tgUser = req.telegramUser;
    
    const updateData = {};
    if (phone) updateData.phone = phone;
    if (telegram) updateData.telegramHandle = telegram;

    const user = await User.findOneAndUpdate(
      { telegramId: tgUser.id.toString() },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isBlocked) return res.status(403).json({ error: 'Account blocked' });

    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;