const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

router.post('/deposit', auth, validate('deposit'), async (req, res) => {
  const tx = await Transaction.create({ userId: req.user._id, type: 'deposit', amount: req.body.amount, paymentMethod: req.body.paymentMethod || 'telebirr', status: 'pending' });
  res.json({ success: true, transaction: { id: tx._id, amount: tx.amount, status: tx.status } });
});

router.post('/withdraw', auth, validate('withdrawal'), async (req, res) => {
  try {
    // SECURITY FIX: Use atomic update with condition to prevent race conditions and double-spending
    const updatedUser = await User.findOneAndUpdate(
      { 
        _id: req.user._id,
        balance: { $gte: req.body.amount } // Condition: must have sufficient balance
      },
      { $inc: { balance: -req.body.amount } },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    const tx = await Transaction.create({ 
      userId: req.user._id, 
      type: 'withdrawal', 
      amount: req.body.amount, 
      paymentMethod: 'telebirr', 
      status: 'pending', 
      metadata: { phone: req.body.phone } 
    });
    res.json({ success: true, transaction: { id: tx._id, amount: tx.amount, newBalance: updatedUser.balance } });
  } catch (err) {
    console.error('Withdrawal error:', err);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

router.get('/:id', auth, async (req, res) => {
  // SECURITY FIX: Add authorization check - users can only view their own transactions
  const tx = await Transaction.findById(req.params.id).lean();
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  
  // Check if user owns this transaction or is admin
  if (tx.userId.toString() !== req.user._id.toString() && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied - cannot view other users transactions' });
  }
  
  res.json({ success: true, transaction: tx });
});

router.get('/history', auth, async (req, res) => {
  const { limit = 20, page = 1 } = req.query;
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(parseInt(limit)).skip(skip).lean(), Transaction.countDocuments({ userId: req.user._id })]);
  res.json({ success: true, transactions, pagination: { page: parseInt(page), total } });
});

module.exports = router;
