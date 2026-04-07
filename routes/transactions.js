const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const verifyTelegramWebAppData = require('../middleware/auth');

// Request deposit
router.post('/deposit', verifyTelegramWebAppData, async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    const tgUser = req.telegramUser;
    
    if (!amount || amount < 20) {
      return res.status(400).json({ error: 'Minimum deposit is 20 ETB' });
    }
    
    const user = await User.findOne({ telegramId: tgUser.id.toString() });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const transaction = await Transaction.create({
      userId: user._id,
      telegramId: user.telegramId,
      type: 'deposit',
      amount: amount,
      paymentMethod: paymentMethod || 'telebirr',
      senderPhone: user.phone,
      status: 'pending',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Optional: Send notification to admin Telegram bot
    // await notifyAdmin(`💰 New deposit request: ${user.firstName} - ${amount} ETB`);

    res.json({
      success: true,
      message: 'Deposit request submitted',
      transactionId: transaction._id,
      instructions: {
        telebirr: '0921302111',
        cbe: '1000318833625',
        note: 'Include your Telegram username in payment reference'
      }
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Failed to create deposit request' });
  }
});

// Request withdrawal
router.post('/withdraw', verifyTelegramWebAppData, async (req, res) => {
  try {
    const { amount, phone } = req.body;
    const tgUser = req.telegramUser;
    
    if (!amount || amount < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal is 10 ETB' });
    }
    
    const user = await User.findOne({ telegramId: tgUser.id.toString() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isBlocked) return res.status(403).json({ error: 'Account blocked' });
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    // Deduct balance immediately (hold funds)
    user.balance -= amount;
    await user.save();

    const transaction = await Transaction.create({
      userId: user._id,
      telegramId: user.telegramId,
      type: 'withdrawal',
      amount: amount,
      paymentMethod: 'telebirr',
      senderPhone: phone,
      status: 'pending',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Withdrawal request submitted',
      transactionId: transaction._id,
      newBalance: user.balance
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// Check transaction status
router.get('/transactions', verifyTelegramWebAppData, async (req, res) => {
  try {
    const tgUser = req.telegramUser;
    const transactions = await Transaction.find({ 
      telegramId: tgUser.id.toString() 
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('type amount status createdAt paymentMethod');

    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;