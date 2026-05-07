// app/routes/admin.js
const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router(); // 👈 MUST be at the top!

console.log('🔐 [ADMIN] Admin routes loaded');

const { auth, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const RoomPool = require('../models/RoomPool');
const Bot = require('../models/Bot');
const { resetBotBalancesDaily, startDailyBotReset, stopDailyBotReset, getBotResetStatus } = require('../utils/botManager');
const { checkAtlasTriggers, batchUpdateUserBalances, updateUserBalance } = require('../utils/balanceManager');

// 🔐 POST /admin/login - Authenticate admin credentials (NO auth middleware needed for login)
router.post('/login', (req, res) => {
  console.log('👮 [ADMIN] Login attempt received');
  console.log('📝 [ADMIN] Request body:', JSON.stringify({ hasBody: !!req.body, keys: req.body ? Object.keys(req.body) : [] }));
  console.log('📝 [ADMIN] Headers:', JSON.stringify({ hasXAdminAuth: !!req.headers['x-admin-auth'] }));
  
  try {
    // Support both header and body authentication
    let masterId, secureCode, securityKey;
    
    // Try to get from request body first
    if (req.body && req.body.masterId) {
      console.log('📝 [ADMIN] Using body authentication');
      masterId = req.body.masterId;
      secureCode = req.body.secureCode;
      securityKey = req.body.securityKey;
    } else {
      // Fallback to header
      const authHeader = req.headers['x-admin-auth'];
      if (!authHeader) {
        console.warn('⚠️ [ADMIN] No credentials provided');
        return res.status(401).json({ error: 'No credentials provided' });
      }
      console.log('📝 [ADMIN] Using header authentication');
      const creds = JSON.parse(authHeader);
      masterId = creds.masterId;
      secureCode = creds.secureCode;
      securityKey = creds.securityKey;
    }

    console.log('🔍 [ADMIN] Checking credentials against environment variables...');
    console.log('🔍 [ADMIN] ADMIN_MASTER_ID exists:', !!process.env.ADMIN_MASTER_ID);
    console.log('🔍 [ADMIN] ADMIN_SECURE_CODE exists:', !!process.env.ADMIN_SECURE_CODE);
    console.log('🔍 [ADMIN] ADMIN_SECURITY_KEY exists:', !!process.env.ADMIN_SECURITY_KEY);
    
    if (
      masterId === process.env.ADMIN_MASTER_ID &&
      secureCode === process.env.ADMIN_SECURE_CODE &&
      securityKey === process.env.ADMIN_SECURITY_KEY
    ) {
      console.log('✅ [ADMIN] Credentials matched!');
      
      // Safe Check: Use proper JWT secret - fail securely if not configured
      const secret = process.env.JWT_SECRET;
      
      if (!secret) {
        console.error('❌ [ADMIN] CRITICAL: No JWT Secret found in environment variables for signing!');
        return res.status(500).json({ error: 'Server configuration error' });
      }
      
      // SECURITY FIX: Use proper JWT signing instead of weak Base64 encoding
      const token = jwt.sign(
        { 
          id: 'admin',
          role: 'admin',
          isAdmin: true
        },
        secret,
        { expiresIn: '24h' }
      );
      
      console.log('✅ [ADMIN] JWT token generated successfully');
      return res.json({ 
        success: true, 
        message: 'Login successful',
        token: token
      });
    } else {
      console.error('❌ [ADMIN] Invalid credentials - mismatch detected');
      console.error('❌ [ADMIN] masterId match:', masterId === process.env.ADMIN_MASTER_ID);
      console.error('❌ [ADMIN] secureCode match:', secureCode === process.env.ADMIN_SECURE_CODE);
      console.error('❌ [ADMIN] securityKey match:', securityKey === process.env.ADMIN_SECURITY_KEY);
      return res.status(403).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('❌ [ADMIN] Admin login error:', err.message);
    console.error('❌ [ADMIN] Stack:', err.stack);
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

// ✅ POST /admin/transaction/:id/process - Approve or Reject transaction
router.post('/transaction/:id/process', auth, adminOnly, async (req, res) => {
  try {
    const { action, reason } = req.body;
    const tx = await Transaction.findById(req.params.id);
    
    if (!tx || tx.status !== 'pending') {
      return res.status(400).json({ error: 'Invalid or already processed transaction' });
    }
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject"' });
    }
    
    if (action === 'approve') {
      tx.status = 'completed';
      tx.approvedBy = req.user._id;
      tx.completedAt = new Date();
      
      // Use atomic update for balance changes
      if (tx.type === 'deposit') { 
        await User.findByIdAndUpdate(tx.userId, { $inc: { balance: tx.amount } });
      } else if (tx.type === 'withdrawal') {
        // For withdrawal, balance was already deducted, just mark as completed
      }
    } else {
      tx.status = 'rejected';
      tx.metadata = tx.metadata || {};
      tx.metadata.rejectionReason = reason || 'No reason provided';
      tx.rejectedAt = new Date();
      
      // Refund for rejected withdrawals
      if (tx.type === 'withdrawal') { 
        await User.findByIdAndUpdate(tx.userId, { $inc: { balance: tx.amount } });
      }
    }
    
    await tx.save();
    res.json({ success: true, message: `Transaction ${action}d successfully`, transaction: tx });
  } catch (err) {
    console.error('Process transaction error:', err);
    res.status(500).json({ error: 'Failed to process transaction' });
  }
});

// 💰 POST /admin/user/add-funds
router.post('/user/add-funds', auth, adminOnly, validate('adminAddFunds'), async (req, res) => {
  try {
    const user = await User.findOne({ phone: req.body.userPhone }).select('_id');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Use atomic update to prevent race conditions
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { balance: req.body.amount } },
      { new: true, select: 'balance' }
    );
    
    Transaction.create({ 
      userId: user._id, 
      type: 'deposit', 
      amount: req.body.amount, 
      status: 'completed', 
      metadata: { manual: true, addedBy: req.user._id } 
    }).catch(console.error);
    
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

// 👤 POST /admin/create-user - Create a new player (without Telegram auth)
// Allows admin to create players manually without needing a database record of its own
router.post('/create-user', auth, adminOnly, async (req, res) => {
  try {
    const { username, firstName, phone, telegramId, balance } = req.body;
    
    // Validate required fields
    if (!username && !phone) {
      return res.status(400).json({ error: 'Username or phone number is required' });
    }
    
    // Check if user already exists by telegramId or phone
    const existingUser = await User.findOne({ 
      $or: [
        ...(telegramId ? [{ telegramId: String(telegramId) }] : []),
        ...(phone ? [{ phone }] : [])
      ]
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this telegramId or phone' });
    }
    
    // Create new user
    const newUser = await User.create({
      telegramId: telegramId ? String(telegramId) : undefined,
      username: username || undefined,
      firstName: firstName || undefined,
      phone: phone || undefined,
      balance: balance || 0,
      gamesPlayed: 0,
      totalWins: 0
    });
    
    res.json({ 
      success: true, 
      message: 'Player created successfully',
      user: {
        _id: newUser._id,
        username: newUser.username,
        firstName: newUser.firstName,
        phone: newUser.phone,
        telegramId: newUser.telegramId,
        balance: newUser.balance
      }
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// 🤖 GET /admin/bots/status - Get all bots with detailed stats
router.get('/bots/status', auth, adminOnly, async (req, res) => {
  try {
    const bots = await Bot.find({}).sort({ name: 1 }).select('-__v');
    
    const botStats = bots.map(bot => ({
      name: bot.name,
      telegramId: bot.telegramId,
      balance: bot.balance,
      totalWins: bot.totalWins,
      totalWinnings: bot.totalWinnings,
      gamesPlayed: bot.gamesPlayed,
      winRate: bot.winRate,
      difficulty: bot.difficulty,
      isActive: bot.isActive,
      lastPlayed: bot.lastPlayed,
      lastRefill: bot.lastRefill,
      refillCount: bot.refillCount,
      createdAt: bot.createdAt
    }));
    
    res.json({ 
      success: true, 
      totalBots: bots.length,
      bots: botStats 
    });
  } catch (err) {
    console.error('Get bots status error:', err);
    res.status(500).json({ error: 'Failed to get bots status' });
  }
});

// 🔄 POST /admin/bots/reset-now - Immediately reset all bot balances to 1000 ETB
router.post('/bots/reset-now', auth, adminOnly, async (req, res) => {
  try {
    console.log('🔄 Admin triggered manual bot balance reset');
    
    const result = await resetBotBalancesDaily();
    
    res.json({ 
      success: true, 
      message: `Reset ${result.reset} bots to 1000 ETB`,
      totalResetAmount: result.totalResetAmount,
      details: result.details
    });
  } catch (err) {
    console.error('Manual bot reset error:', err);
    res.status(500).json({ error: `Failed to reset bots: ${err.message}` });
  }
});

// ⏰ POST /admin/bots/schedule-reset - Start/stop the daily reset scheduler
router.post('/bots/schedule-reset', auth, adminOnly, async (req, res) => {
  try {
    const { action, hour, minute } = req.body;
    
    if (action === 'start') {
      const h = hour !== undefined ? Number(hour) : 0;
      const m = minute !== undefined ? Number(minute) : 0;
      
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return res.status(400).json({ error: 'Invalid hour or minute. Hour: 0-23, Minute: 0-59' });
      }
      
      startDailyBotReset(h, m);
      
      res.json({ 
        success: true, 
        message: `Daily bot reset scheduled for ${h}:${m.toString().padStart(2, '0')}`,
        isRunning: true
      });
    } else if (action === 'stop') {
      stopDailyBotReset();
      
      res.json({ 
        success: true, 
        message: 'Daily bot reset scheduler stopped',
        isRunning: false
      });
    } else {
      return res.status(400).json({ error: 'Invalid action. Must be "start" or "stop"' });
    }
  } catch (err) {
    console.error('Schedule bot reset error:', err);
    res.status(500).json({ error: `Failed to manage scheduler: ${err.message}` });
  }
});

// 📊 GET /admin/bots/reset-status - Get current status of the reset scheduler
router.get('/bots/reset-status', auth, adminOnly, async (req, res) => {
  try {
    const status = getBotResetStatus();
    
    res.json({ 
      success: true, 
      isRunning: status.isRunning,
      message: status.isRunning ? 'Daily reset scheduler is running' : 'Daily reset scheduler is stopped'
    });
  } catch (err) {
    console.error('Get reset status error:', err);
    res.status(500).json({ error: 'Failed to get reset status' });
  }
});

// 🔍 GET /admin/atlas/trigger-status - Check Atlas Trigger status and get manual resume guide
router.get('/atlas/trigger-status', auth, adminOnly, async (req, res) => {
  try {
    const result = await checkAtlasTriggers();
    
    res.json({ 
      success: true,
      ...result
    });
  } catch (err) {
    console.error('Check trigger status error:', err);
    res.status(500).json({ error: 'Failed to check trigger status' });
  }
});

// 📦 POST /admin/balance/batch-update - Batch update user balances (reduces API calls)
router.post('/balance/batch-update', auth, adminOnly, async (req, res) => {
  try {
    const { updates } = req.body; // Array of { userId, amount }
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Updates array is required and must not be empty' });
    }
    
    console.log(`📦 [ADMIN] Batch updating ${updates.length} user balances...`);
    
    const result = await batchUpdateUserBalances(updates);
    
    res.json({ 
      success: true, 
      message: `Successfully updated ${result.modifiedCount || 0} user balances`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Batch balance update error:', err);
    res.status(500).json({ error: `Failed to batch update balances: ${err.message}` });
  }
});

// 💰 POST /admin/balance/update-user - Single user balance update with retry logic
router.post('/balance/update-user', auth, adminOnly, async (req, res) => {
  try {
    const { userId, amount, totalWins, totalWinnings, gamesPlayed } = req.body;
    
    if (!userId || amount === undefined) {
      return res.status(400).json({ error: 'userId and amount are required' });
    }
    
    console.log(`💰 [ADMIN] Updating user ${userId} balance by ${amount} ETB...`);
    
    const additionalFields = {};
    if (totalWins !== undefined) additionalFields.totalWins = totalWins;
    if (totalWinnings !== undefined) additionalFields.totalWinnings = totalWinnings;
    if (gamesPlayed !== undefined) additionalFields.gamesPlayed = gamesPlayed;
    
    const updatedUser = await updateUserBalance(userId, amount, additionalFields);
    
    res.json({ 
      success: true, 
      message: 'User balance updated successfully',
      user: {
        id: updatedUser._id,
        name: updatedUser.firstName || updatedUser.username,
        balance: updatedUser.balance
      }
    });
  } catch (err) {
    console.error('Single balance update error:', err);
    res.status(500).json({ error: `Failed to update user balance: ${err.message}` });
  }
});

module.exports = router; // 👈 Export at the end
