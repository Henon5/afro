const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const verifyTelegramData = (initData) => {
  if (!process.env.TELEGRAM_BOT_TOKEN) return true; // Skip in dev if no token
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  return crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex') === hash;
};

exports.auth = async (req, res, next) => {
  try {
    let user;
    const initData = req.headers['x-telegram-init-data'];
    if (initData) {
      if (!verifyTelegramData(initData)) return res.status(401).json({ error: 'Invalid Telegram data' });
      const params = new URLSearchParams(initData);
      const tgUser = JSON.parse(params.get('user'));
      user = await User.findOneAndUpdate({ telegramId: String(tgUser.id) }, { telegramId: String(tgUser.id), username: tgUser.username, firstName: tgUser.first_name, lastName: tgUser.last_name, lastActive: Date.now() }, { upsert: true, new: true, setDefaultsOnInsert: true });
    } else if (req.headers['x-admin-auth']) {
      const { masterId, secureCode, securityKey } = JSON.parse(req.headers['x-admin-auth']);
      if (masterId === process.env.ADMIN_MASTER_ID && secureCode === process.env.ADMIN_SECURE_CODE && securityKey === process.env.ADMIN_SECURITY_KEY) {
        user = { _id: 'admin', isAdmin: true, displayName: 'MasterAdmin' };
      } else {
        return res.status(401).json({ error: 'Invalid admin credentials' });
      }
    }
    
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.isBlocked) return res.status(403).json({ error: 'Account is blocked' });
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

exports.adminOnly = (req, res, next) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
};
