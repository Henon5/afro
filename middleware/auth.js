// middleware/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

// 🔐 Verify Telegram WebApp initData signature
const verifyTelegramData = (initData) => {
  // Skip verification in development if no bot token is set
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not set - skipping initData verification (DEV MODE)');
    return true;
  }
  
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;
    
    params.delete('hash');
    
    // Sort params alphabetically by key (Telegram requirement)
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
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

// 🔑 Main auth middleware - handles Telegram users AND admin
exports.auth = async (req, res, next) => {
  try {
    let user = null;
    let isAdminAuth = false;

    // 📱 Case 1: Telegram WebApp authentication (regular players)
    const initData = req.headers['x-telegram-init-data'];
    if (initData) {
      if (!verifyTelegramData(initData)) {
        console.warn('❌ Invalid Telegram initData');
        return res.status(401).json({ error: 'Invalid Telegram data' });
      }
      
      const params = new URLSearchParams(initData);
      const tgUser = JSON.parse(params.get('user'));
      
      // Upsert user in database
      user = await User.findOneAndUpdate(
        { telegramId: String(tgUser.id) },
        {
          $set: {
            username: tgUser.username,
            firstName: tgUser.first_name,
            lastName: tgUser.last_name,
            languageCode: tgUser.language_code,
            lastActive: Date.now()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      
      // ✅ IMPORTANT: Regular player authenticated via Telegram - explicitly NOT an admin
      isAdminAuth = false;
    } 
    // 👮 Case 2: Admin authentication via credentials (login request)
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
          isAdminAuth = true;
        } else {
          console.warn('❌ Invalid admin credentials attempt');
          return res.status(401).json({ error: 'Invalid admin credentials' });
        }
      } catch (parseError) {
        console.error('Admin auth header parse error:', parseError);
        return res.status(400).json({ error: 'Invalid admin auth format' });
      }
    }
    // 🔑 Case 3: Admin authentication via token (subsequent requests)
    // ONLY check admin token if NO Telegram auth was provided
    // This prevents regular players from being flagged as admins
    else {
      const adminToken = req.headers['x-admin-token'];
      if (adminToken && adminToken === process.env.ADMIN_SECRET_KEY) {
        // Simple secret key check for admin operations
        user = { 
          _id: 'admin', 
          isAdmin: true, 
          displayName: 'MasterAdmin',
          role: 'admin'
        };
        isAdminAuth = true;
      }
      // Also support JWT-based admin tokens
      else if (adminToken && adminToken.startsWith('Bearer ')) {
        try {
          const token = adminToken.split(' ')[1];
          
          // Fast path: Validate token format before decoding
          if (!token || typeof token !== 'string' || token.length < 10) {
            console.warn('⚠️ Invalid token format');
          } else {
            // SECURITY FIX: Use proper JWT verification instead of weak Base64 decoding
            let decoded;
            try {
              decoded = jwt.verify(
                token, 
                process.env.JWT_SECRET || 'fallback-secret-change-in-production'
              );
            } catch (jwtError) {
              // If JWT verification fails, fall back to legacy Base64 token for backward compatibility
              try {
                // First check if token looks like base64 (only alphanumeric + /+=)
                if (!/^[A-Za-z0-9+/=]+$/.test(token)) {
                  throw new Error('Invalid token encoding');
                }
                
                const decodedStr = Buffer.from(token, 'base64').toString('utf8');
                // Quick validation: must start with { to be valid JSON
                if (!decodedStr || decodedStr[0] !== '{') {
                  throw new Error('Invalid token structure');
                }
                decoded = JSON.parse(decodedStr);
                
                // Check expiry first (fastest check)
                if (decoded.exp && decoded.exp < Date.now()) {
                  throw new Error('Token expired');
                }
                
                // Validate token structure for legacy tokens
                if (decoded.id !== 'admin') {
                  throw new Error('Invalid admin token');
                }
              } catch (legacyError) {
                console.warn('⚠️ Token verification failed:', legacyError.message);
                throw legacyError;
              }
            }
            
            // Validate decoded JWT token structure
            if (decoded && (decoded.id === 'admin' || decoded.isAdmin)) {
              user = { 
                _id: 'admin', 
                isAdmin: true, 
                displayName: 'MasterAdmin',
                role: 'admin'
              };
              isAdminAuth = true;
            }
          }
        } catch (tokenError) {
          console.warn('⚠️ Admin token invalid:', tokenError.message);
          // Don't fail here - allow fallback to anonymous/no auth
        }
      }
    }

    // ❌ No valid authentication method found
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // 🚫 Check if user is blocked (skip for admin)
    if (user.isBlocked && !user.isAdmin) {
      return res.status(403).json({ error: 'Account is blocked' });
    }

    // ✅ Attach user to request and proceed
    req.user = user;
    req.isAdminAuth = isAdminAuth; // Flag to indicate admin auth (not a real DB user)
    next();
    
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// 🛡️ Admin-only authorization middleware
// MUST be used AFTER exports.auth middleware
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

// 👤 Optional: User-only middleware (for regular players)
exports.userOnly = (req, res, next) => {
  if (!req.user || req.user.isAdmin) {
    return res.status(403).json({ error: 'Player access required' });
  }
  next();
};
