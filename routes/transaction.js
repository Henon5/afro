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
  const user = await User.findById(req.user._id);
  if (user.balance < req.body.amount) return res.status(400).json({ error: 'Insufficient balance' });
  user.balance -= req.body.amount; await user.save();
  const tx = await Transaction.create({ userId: user._id, type: 'withdrawal', amount: req.body.amount, paymentMethod: 'telebirr', status: 'pending', metadata: { phone: req.body.phone } });
  res.json({ success: true, transaction: { id: tx._id, amount: tx.amount, newBalance: user.balance } });
});

router.get('/:id', auth, async (req, res) => {
  const tx = await Transaction.findById(req.params.id).lean();
  if (!tx) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ success: true, transaction: tx });
});

router.get('/history', auth, async (req, res) => {
  const { limit = 20, page = 1 } = req.query;
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(parseInt(limit)).skip(skip).lean(), Transaction.countDocuments({ userId: req.user._id })]);
  res.json({ success: true, transactions, pagination: { page: parseInt(page), total } });
});

module.exports = router;
