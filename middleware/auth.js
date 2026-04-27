// middleware/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

// 🔐 Verify Telegram WebApp initData signature
const verifyTelegramData = (initData) => {
  // Skip verification in development if no bot token is set
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
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
    console.error('Telegram data verification error:', error.message);
    return false;
  }
};

// 👤 Process Telegram user data and upsert to database
const processTelegramUser = async (tgUser) => {
  // Validate required fields
  if (!tgUser.id) {
    throw new Error('Invalid Telegram user data - missing ID');
  }
  
  // Upsert user in database
  const user = await User.findOneAndUpdate(
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
  
  return user;
};

// 🔑 Main auth middleware - handles Telegram users AND admin
exports.auth = async (req, res, next) => {
  try {
    let user = null;
    let isAdminAuth = false;
    
    // Log the raw authorization header for debugging
    const authHeader = req.headers.authorization;
    console.log('🔑 Raw Authorization Header:', authHeader || 'null');
    
    if (!authHeader || authHeader === 'null' || authHeader === 'undefined') {
      console.log('❌ No Token Received');
    } else {
      console.log('🔑 Token Received:', authHeader.substring(0, 50) + '...');
    }

    // 📱 Case 1: Telegram WebApp authentication via Authorization header
    // First, strip Bearer prefix if present (frontend bug fix)
    let authToken = authHeader;
    if (authToken && authToken.startsWith('Bearer ')) {
      authToken = authToken.substring(7); // Remove 'Bearer ' prefix
      console.log('✂️ Stripped Bearer prefix, raw token:', authToken.substring(0, 50) + '...');
    }
    
    // Check if it's Telegram initData (starts with query_id= or user=, or contains hash=)
    if (authToken && (authToken.startsWith('query_id=') || authToken.startsWith('user=') || authToken.includes('hash='))) {
      try {
        const initData = authToken;
        
        // Verify Telegram data signature
        if (!verifyTelegramData(initData)) {
          console.warn('❌ Invalid Telegram initData signature');
          return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        
        // Handle URL-encoded user string (Telegram sends it double-encoded sometimes)
        let decodedUserStr = userStr;
        if (userStr && userStr.startsWith('%7B')) {
          try {
            decodedUserStr = decodeURIComponent(userStr);
          } catch (e) {
            // Keep original if decoding fails
          }
        }
        
        if (!decodedUserStr) {
          console.warn('❌ Missing user data in Telegram initData');
          return res.status(400).json({ error: 'Invalid Telegram data format' });
        }
        
        let tgUser;
        try {
          tgUser = JSON.parse(decodedUserStr);
        } catch (parseError) {
          console.error('❌ Failed to parse Telegram user data:', parseError.message);
          return res.status(400).json({ error: 'Invalid Telegram user data format' });
        }
        
        user = await processTelegramUser(tgUser);
        
        console.log('✅ Player authenticated via Authorization header:', user._id, 'telegramId:', user.telegramId);
        isAdminAuth = false;
      } catch (telegramError) {
        console.error('❌ Telegram authentication error:', telegramError.message);
        return res.status(400).json({ error: 'Invalid Telegram authentication data' });
      }
    }
    // 📱 Case 2: Telegram WebApp authentication via X-Telegram-Init-Data header
    else if (req.headers['x-telegram-init-data']) {
      try {
        const initData = req.headers['x-telegram-init-data'];
        
        // Verify Telegram data signature
        if (!verifyTelegramData(initData)) {
          console.warn('❌ Invalid Telegram initData');
          return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        
        // Handle URL-encoded user string (Telegram sends it double-encoded sometimes)
        let decodedUserStr = userStr;
        if (userStr && userStr.startsWith('%7B')) {
          try {
            decodedUserStr = decodeURIComponent(userStr);
          } catch (e) {
            // Keep original if decoding fails
          }
        }
        
        if (!decodedUserStr) {
          console.warn('❌ Missing user data in Telegram initData');
          return res.status(400).json({ error: 'Invalid Telegram data format' });
        }
        
        let tgUser;
        try {
          tgUser = JSON.parse(decodedUserStr);
        } catch (parseError) {
          console.error('❌ Failed to parse Telegram user data:', parseError.message);
          return res.status(400).json({ error: 'Invalid Telegram user data format' });
        }
        
        user = await processTelegramUser(tgUser);
        
        console.log('✅ Player authenticated via X-Telegram-Init-Data:', user._id, 'telegramId:', user.telegramId);
        isAdminAuth = false;
      } catch (telegramError) {
        console.error('❌ Telegram authentication error:', telegramError.message);
        return res.status(400).json({ error: 'Invalid Telegram authentication data' });
      }
    } 
    // 👮 Case 3: Admin authentication via credentials (login request)
    else if (req.headers['x-admin-auth']) {
      try {
        const authHeader = req.headers['x-admin-auth'];
        
        // Validate header is valid JSON string before parsing
        if (typeof authHeader !== 'string' || !authHeader.trim().startsWith('{')) {
          console.warn('❌ Invalid admin auth header format');
          return res.status(400).json({ error: 'Invalid admin auth format' });
        }
        
        const { masterId, secureCode, securityKey } = JSON.parse(authHeader);
        
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
        console.error('Admin auth header parse error:', parseError.message);
        return res.status(400).json({ error: 'Invalid admin auth format' });
      }
    }
    // 🔑 Case 4: JWT authentication (Bearer token)
    else if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        
        // Fast path: Validate token format before decoding
        if (!token || typeof token !== 'string' || token.length < 10) {
          console.warn('⚠️ Invalid token format');
          return res.status(401).json({ error: 'Invalid session. Please login again.' });
        }
        
        const secret = process.env.JWT_SECRET;
        
        if (!secret) {
          console.error('❌ CRITICAL: No JWT Secret found in environment variables!');
        }
        
        try {
          const decoded = jwt.verify(token, secret || 'fallback-secret-change-in-production');
          
          // Check if this is an admin token
          if (decoded && (decoded.id === 'admin' || decoded.isAdmin)) {
            user = { 
              _id: 'admin', 
              isAdmin: true, 
              displayName: 'MasterAdmin',
              role: 'admin'
            };
            isAdminAuth = true;
          } 
          // Regular user JWT - find user by telegramId from token
          else if (decoded && decoded.telegramId) {
            user = await User.findOneAndUpdate(
              { telegramId: String(decoded.telegramId) },
              {
                $set: {
                  lastActive: Date.now()
                }
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            isAdminAuth = false;
            console.log('✅ Player authenticated via JWT:', user._id, 'telegramId:', user.telegramId);
          } else {
            console.warn('⚠️ Valid JWT but missing telegramId - cannot identify user');
            return res.status(401).json({ error: 'Invalid token payload' });
          }
        } catch (jwtError) {
          console.warn('⚠️ JWT verification failed:', jwtError.message);
          if (jwtError.name === 'TokenExpiredError') {
            console.error('❌ Token Expired:', jwtError.expiredAt);
          } else if (jwtError.name === 'JsonWebTokenError') {
            console.error('❌ Invalid Token (Wrong Secret or Malformed):', jwtError.message);
          } else {
            console.error('❌ JWT Error:', jwtError.name, jwtError.message);
          }
          return res.status(401).json({ error: 'Invalid session. Please login again.' });
        }
      } catch (tokenError) {
        console.warn('⚠️ JWT token processing error:', tokenError.message);
        return res.status(401).json({ error: 'Invalid session. Please login again.' });
      }
    }
    // 🔑 Case 5: Admin authentication via x-admin-token header
    else {
      const adminToken = req.headers['x-admin-token'];
      
      // STRICT CHECK: Only set admin if token matches exactly
      if (adminToken && adminToken === process.env.ADMIN_SECRET_KEY) {
        user = { 
          _id: 'admin', 
          isAdmin: true, 
          displayName: 'MasterAdmin',
          role: 'admin'
        };
        isAdminAuth = true;
      }
    }

    // ❌ No valid authentication method found
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // 🛡️ FINAL SAFEGUARD: Ensure regular Telegram users are NEVER flagged as admin
    // EXCEPT: If their telegramId is in the ADMIN_IDS environment variable
    if (user.telegramId || (user._id && user._id !== 'admin')) {
      // Check if this user's telegramId is in the admin list
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
      const userIdToCheck = String(user.telegramId || user._id);
      const isAdminByTelegramId = adminIds.includes(userIdToCheck);
      
      if (isAdminByTelegramId) {
        // This user is an admin based on their Telegram ID or User ID
        isAdminAuth = true;
        user.isAdmin = true;
        console.log('✅ Admin authenticated via ID:', user._id, 'telegramId:', user.telegramId, 'matched adminId:', userIdToCheck);
      } else {
        // This is a regular player - explicitly set isAdminAuth to false
        isAdminAuth = false;
        user.isAdmin = false;
        console.log('✅ Regular player authenticated:', user._id, 'telegramId:', user.telegramId, 'adminIds:', adminIds);
      }
    } else if (user._id === 'admin') {
      console.log('👮 Admin authenticated via credentials');
    }

    // 🚫 Check if user is blocked (skip for admin)
    if (user.isBlocked && !user.isAdmin) {
      return res.status(403).json({ error: 'Account is blocked' });
    }

    // ✅ Attach user to request and proceed
    req.user = user;
    req.isAdminAuth = isAdminAuth; // Flag to indicate admin auth (not a real DB user)
    console.log('✅ Auth successful - user:', req.user._id, 'isAdminAuth:', req.isAdminAuth);
    next();
    
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
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
