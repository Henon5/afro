const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');

// GET /admin/stats (also acts as login verification)
router.get('/stats', adminOnly, async (req, res) => {
  try {
    const [totalUsers, activeUsers, totalBalance, pendingDeposits, pendingWithdrawals, totalPools, houseEarnings] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 86400000) } }),
      User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
      Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
      Transaction.countDocuments({ type: 'withdrawal', status: 'pending' }),
      RoomPool.aggregate([{ $group: { _id: null, total: { $sum: '$currentPool' } } }]),
      RoomPool.aggregate([{ $group: { _id: null, total: { $sum: '$houseTotal' } } }])
    ]);
    
    res.json({ 
      success: true, 
      stats: { 
        totalUsers, 
        activeUsers, 
        totalBalance: totalBalance[0]?.total || 0, 
        pendingDeposits, 
        pendingWithdrawals, 
        totalPools: totalPools[0]?.total || 0, 
        houseEarnings: houseEarnings[0]?.total || 0 
      } 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

router.get('/transactions', adminOnly, async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: req.query.status || 'pending' })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'username firstName phone')
      .lean();
    res.json({ success: true, transactions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

router.post('/transaction/:id/approve', adminOnly, validate('adminApproveTransaction'), async (req, res) => {
  try {
    const { transactionId, action, reason } = req.body;
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.status !== 'pending') return res.status(400).json({ error: 'Invalid transaction' });
    
    if (action === 'approve') {
      tx.status = 'completed'; tx.approvedBy = req.user._id;
      if (tx.type === 'deposit') { 
        const u = await User.findById(tx.userId); 
        if (u) { u.balance += tx.amount; await u.save(); } 
      }
    } else {
      tx.status = 'rejected'; tx.metadata.rejectionReason = reason;
      if (tx.type === 'withdrawal') { 
        const u = await User.findById(tx.userId); 
        if (u) { u.balance += tx.amount; await u.save(); } 
      }
    }
    await tx.save();
    res.json({ success: true, message: `Transaction ${action}d` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process transaction' });
  }
});

router.post('/user/add-funds', adminOnly, validate('adminAddFunds'), async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.body.userPhone });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.balance += req.body.amount; 
    await user.save();
    await Transaction.create({ 
      userId: user._id, 
      type: 'deposit', 
      amount: req.body.amount, 
      status: 'completed', 
      metadata: { manual: true } 
    });
    res.json({ success: true, newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add funds' });
  }
});

router.post('/pools/reset', adminOnly, async (req, res) => {
  try {
    await RoomPool.updateMany({}, { currentPool: 0, houseTotal: 0, players: [] });
    res.json({ success: true, message: 'Pools reset' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset pools' });
  }
});

module.exports = router;
