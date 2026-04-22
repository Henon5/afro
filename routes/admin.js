// app/routes/admin.js
const express = require('express');
const router = express.Router(); // 👈 MUST be at the top!

const { auth, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');

// 🔐 POST /admin/login - Authenticate admin credentials (NO auth middleware needed for login)
router.post('/login', (req, res) => {
  try {
    // Support both header and body authentication
    let masterId, secureCode, securityKey;
    
    // Try to get from request body first
    if (req.body && req.body.masterId) {
      masterId = req.body.masterId;
      secureCode = req.body.secureCode;
      securityKey = req.body.securityKey;
    } else {
      // Fallback to header
      const authHeader = req.headers['x-admin-auth'];
      if (!authHeader) {
        return res.status(401).json({ error: 'No credentials provided' });
      }
      const creds = JSON.parse(authHeader);
      masterId = creds.masterId;
      secureCode = creds.secureCode;
      securityKey = creds.securityKey;
    }

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
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const [totalUsers, activeUsers, totalBalance, pendingDeposits, pendingWithdrawals, totalPools, houseEarnings, dailyHouseCommission] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 86400000) } }),
      User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
      Transaction.countDocuments({ type: 'deposit', status: 'pending' }),
      Transaction.countDocuments({ type: 'withdrawal', status: 'pending' }),
      RoomPool.aggregate([{ $group: { _id: null, total: { $sum: '$currentPool' } } }]),
      RoomPool.aggregate([{ $group: { _id: null, total: { $sum: '$houseTotal' } } }]),
      RoomPool.aggregate([{ 
        $match: { updatedAt: { $gte: startOfDay } } 
      }, { 
        $group: { _id: null, total: { $sum: '$houseTotal' } } 
      }])
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
        houseEarnings: houseEarnings[0]?.total || 0,
        dailyHouseCommission: dailyHouseCommission[0]?.total || 0
      } 
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// 📋 GET /admin/transactions
router.get('/transactions', auth, adminOnly, async (req, res) => {
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
router.post('/transaction/:id/approve', auth, adminOnly, validate('adminApproveTransaction'), async (req, res) => {
  try {
    const { transactionId, action, reason } = req.body;
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.status !== 'pending') return res.status(400).json({ error: 'Invalid transaction' });
    
    if (action === 'approve') {
      tx.status = 'completed'; 
      tx.approvedBy = req.user._id;
      
      // Use atomic update for balance changes
      if (tx.type === 'deposit') { 
        await User.findByIdAndUpdate(tx.userId, { $inc: { balance: tx.amount } });
      }
    } else {
      tx.status = 'rejected'; 
      tx.metadata.rejectionReason = reason;
      
      // Refund for rejected withdrawals
      if (tx.type === 'withdrawal') { 
        await User.findByIdAndUpdate(tx.userId, { $inc: { balance: tx.amount } });
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
router.post('/user/add-funds', auth, adminOnly, validate('adminAddFunds'), async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.body.userPhone });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Use atomic update to prevent race conditions
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { balance: req.body.amount } },
      { new: true }
    );
    
    await Transaction.create({ 
      userId: user._id, 
      type: 'deposit', 
      amount: req.body.amount, 
      status: 'completed', 
      metadata: { manual: true, addedBy: req.user._id } 
    });
    
    res.json({ success: true, newBalance: updatedUser.balance });
  } catch (err) {
    console.error('Add funds error:', err);
    res.status(500).json({ error: 'Failed to add funds' });
  }
});

// 🔄 POST /admin/pools/reset
router.post('/pools/reset', auth, adminOnly, async (req, res) => {
  try {
    await RoomPool.updateMany({}, { currentPool: 0, houseTotal: 0, players: [] });
    res.json({ success: true, message: 'Pools reset' });
  } catch (err) {
    console.error('Reset pools error:', err);
    res.status(500).json({ error: 'Failed to reset pools' });
  }
});

module.exports = router; // 👈 Export at the end
