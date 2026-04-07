const crypto = require('crypto');

const verifyTelegramWebAppData = (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    if (!initData) {
      return res.status(401).json({ error: 'Telegram init data required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Parse init data
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');

    // Sort params alphabetically
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Generate secret key
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Generate expected hash
    const expectedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Verify hash
    if (hash !== expectedHash) {
      return res.status(401).json({ error: 'Invalid Telegram data' });
    }

    // Check auth_date (prevent replay attacks - valid for 5 minutes)
    const authDate = new Date(parseInt(params.get('auth_date')) * 1000);
    const now = new Date();
    if (now - authDate > 5 * 60 * 1000) {
      return res.status(401).json({ error: 'Init data expired' });
    }

    // Parse user data and attach to request
    const userStr = params.get('user');
    if (userStr) {
      req.telegramUser = JSON.parse(userStr);
    }
    
    req.initData = Object.fromEntries(params);
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = verifyTelegramWebAppData;