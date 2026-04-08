const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const User = require('../models/User');

router.post('/profile', auth, validate('updateProfile'), async (req, res) => {
  try {
    const updates = { firstName: req.body.name || req.user.firstName, phone: req.body.phone || req.user.phone, telegramHandle: req.body.telegramHandle || req.user.telegramHandle, lastActive: Date.now() };
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user: { displayName: user.displayName, phone: user.phone, telegramHandle: user.telegramHandle } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;