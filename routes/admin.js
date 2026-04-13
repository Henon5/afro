// app/routes/admin.js
const express = require('express');
const router = express.Router(); // 👈 MUST be at the top!

const { adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');

// 🔐 POST /admin/login - Authenticate admin credentials
router.post('/login', (req, res) => {
  try {
    const authHeader = req.headers['x-admin-auth'];
    if (!authHeader) {
      return res.status(401).json({ error: 'No credentials provided' });
    }
    
    const { masterId, secureCode, securityKey } = JSON.parse(authHeader);

    if (
      masterId === process.env.ADMIN_MASTER_ID &&
      secureCode === process.env.ADMIN_SECURE_CODE &&
      securityKey === process.env.ADMIN_SECURITY_KEY
    ) {
      // Generate a simple token (in production: use JWT)
      const token = Buffer.from(JSON.stringify({
        id: 'admin',
        exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      })).toString('base64');
      
      return res.json({ 
        success: true, 
        message: 'Login successful',
        token: token
      });
    } else {
      return res.status(403).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(400).json({ error: 'Invalid request format' });
  }
});

// 📊 GET /admin/stats - Requires valid token
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
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// 📋 GET /admin/transactions
router.get('/transactions', adminOnly, async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: req.query.status || 'pending' })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'username firstName phone')
      .lean();
    res.json({ success: true, transactions });
  } catch (err) {
    console.error('Fetch transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ✅ POST /admin/transaction/:id/approve
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
    console.error('Process transaction error:', err);
    res.status(500).json({ error: 'Failed to process transaction' });
  }
});

// 💰 POST /admin/user/add-funds
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
    console.error('Add funds error:', err);
    res.status(500).json({ error: 'Failed to add funds' });
  }
});

// 🔄 POST /admin/pools/reset
router.post('/pools/reset', adminOnly, async (req, res) => {
  try {
    await RoomPool.updateMany({}, { currentPool: 0, houseTotal: 0, players: [] });
    res.json({ success: true, message: 'Pools reset' });
  } catch (err) {
    console.error('Reset pools error:', err);
    res.status(500).json({ error: 'Failed to reset pools' });
  }
});

module.exports = router; // 👈 Export at the end
