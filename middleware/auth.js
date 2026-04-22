/**
 * Authentication Middleware
 * Handles Telegram WebApp authentication, admin authentication, and user authorization
 * @module middleware/auth
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

/**
 * Verify Telegram WebApp initData signature
 * @param {string} initData - Telegram WebApp initialization data
 * @returns {boolean} - True if valid, false otherwise
 */
const verifyTelegramData = (initData) => {
  // Skip verification in development if no bot token is set
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set - skipping initData verification (DEV MODE)');
    return true;
  }
  
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    
    if (!hash) {
      return false;
    }
    
    params.delete('hash');
    
    // Sort params alphabetically by key (Telegram requirement)
    const dataCheckString = Array.from(params.entries())
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Generate secret key per Telegram docs
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN)
      .digest();
    
    // Compute expected hash
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    // Ensure both hashes are same length before comparison
    if (hash.length !== expectedHash.length) {
      console.warn('Hash length mismatch');
      return false;
    }
    
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch (error) {
    console.error('Telegram data verification error:', error);
    return false;
  }
};

/**
 * Main authentication middleware
 * Handles three authentication methods:
 * 1. Telegram WebApp (via x-telegram-init-data header)
 * 2. Admin credentials (via x-admin-auth header)
 * 3. Admin token (via x-admin-token or Authorization header)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.auth = async (req, res, next) => {
  try {
    let user = null;

    // Case 1: Telegram WebApp authentication
    const initData = req.headers['x-telegram-init-data'];
    if (initData) {
      if (!verifyTelegramData(initData)) {
        console.warn('❌ Invalid Telegram initData');
        return res.status(401).json({ error: 'Invalid Telegram data' });
      }
      
      const params = new URLSearchParams(initData);
      const telegramUser = JSON.parse(params.get('user'));
      
      // Upsert user in database
      user = await User.findOneAndUpdate(
        { telegramId: String(telegramUser.id) },
        {
          telegramId: String(telegramUser.id),
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          languageCode: telegramUser.language_code,
          lastActive: Date.now()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } 
    // Case 2: Admin authentication via credentials (login request)
    else if (req.headers['x-admin-auth']) {
      try {
        const { masterId, secureCode, securityKey } = JSON.parse(req.headers['x-admin-auth']);
        
        if (
          masterId === process.env.ADMIN_MASTER_ID &&
          secureCode === process.env.ADMIN_SECURE_CODE &&
          securityKey === process.env.ADMIN_SECURITY_KEY
        ) {
          user = { 
            _id: 'admin', 
            isAdmin: true, 
            displayName: 'MasterAdmin',
            role: 'admin'
          };
        } else {
          console.warn('❌ Invalid admin credentials attempt');
          return res.status(401).json({ error: 'Invalid admin credentials' });
        }
      } catch (parseError) {
        console.error('Admin auth header parse error:', parseError);
        return res.status(400).json({ error: 'Invalid admin auth format' });
      }
    } 
    // Case 3: Admin authentication via token (subsequent requests)
    const adminToken = req.headers['x-admin-token'] || req.headers['authorization'];
    if (adminToken) {
      try {
        // Handle "Bearer <token>" format for Authorization header
        const token = adminToken.startsWith('Bearer ') 
          ? adminToken.split(' ')[1] 
          : adminToken;
        
        // Validate token format before decoding
        if (!token || typeof token !== 'string' || token.length < 10) {
          console.warn('⚠️ Invalid token format');
          return res.status(401).json({ error: 'Invalid token format' });
        }
        
        // Decode base64 token with early validation
        let decoded;
        try {
          const decodedStr = Buffer.from(token, 'base64').toString('utf8');
          // Quick validation: must start with { to be valid JSON
          if (decodedStr[0] !== '{') {
            throw new Error('Invalid token structure');
          }
          decoded = JSON.parse(decodedStr);
        } catch (decodeErr) {
          return res.status(401).json({ error: 'Invalid token encoding' });
        }
        
        // Check expiry first (fastest check)
        if (decoded.exp && decoded.exp < Date.now()) {
          return res.status(401).json({ error: 'Admin token expired' });
        }
        
        // Validate token structure
        if (decoded.id !== 'admin') {
          return res.status(401).json({ error: 'Invalid admin token' });
        }
        
        user = { 
          _id: 'admin', 
          isAdmin: true, 
          displayName: 'MasterAdmin',
          role: 'admin'
        };
      } catch (tokenError) {
        return res.status(401).json({ error: 'Invalid or malformed admin token' });
      }
    }

    // No valid authentication method found
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user is blocked (skip for admin)
    if (user.isBlocked && !user.isAdmin) {
      return res.status(403).json({ error: 'Account is blocked' });
    }

    // Attach user to request and proceed
    req.user = user;
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Admin-only authorization middleware
 * Must be used AFTER auth middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!req.user.isAdmin) {
    console.warn(`🚫 Non-admin access attempt by user: ${req.user._id || 'unknown'}`);
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

/**
 * User-only middleware (for regular players, excludes admins)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.userOnly = (req, res, next) => {
  if (!req.user || req.user.isAdmin) {
    return res.status(403).json({ error: 'Player access required' });
  }
  next();
};
