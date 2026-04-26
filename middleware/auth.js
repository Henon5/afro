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
    console.error('Telegram data verification error:', error.message);
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
      try {
        // Skip verification in development if no bot token is set
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
        
        const tgUser = JSON.parse(decodedUserStr);
        
        // Validate required fields
        if (!tgUser.id) {
          console.warn('❌ Invalid Telegram user data - missing ID');
          return res.status(400).json({ error: 'Invalid Telegram user data' });
        }
        
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
        
        // Log successful user creation/update
        console.log('✅ Player authenticated:', user._id, 'telegramId:', user.telegramId);
        
        // ✅ IMPORTANT: Regular player authenticated via Telegram - explicitly NOT an admin
        isAdminAuth = false;
      } catch (telegramError) {
        console.error('❌ Telegram authentication error:', telegramError.message);
        return res.status(400).json({ error: 'Invalid Telegram authentication data' });
      }
    } 
    // 👮 Case 2: Admin authentication via credentials (login request)
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
    // 🔑 Case 3: Admin authentication via token (subsequent requests)
    // ONLY check admin token if NO Telegram auth was provided
    // This prevents regular players from being flagged as admins
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
      // Also support JWT-based admin tokens
      else if (adminToken && adminToken.startsWith('Bearer ')) {
        try {
          const token = adminToken.split(' ')[1];
          
          // Fast path: Validate token format before decoding
          if (!token || typeof token !== 'string' || token.length < 10) {
            console.warn('⚠️ Invalid token format');
            // STOP HERE - Don't let invalid tokens continue as admin
            return res.status(401).json({ error: 'Invalid session. Please login again.' });
          }
          
          // SECURITY FIX: Use proper JWT verification ONLY - no Base64 fallback for Bearer tokens
          // This prevents "Invalid Base64" errors when regular player JWTs are sent
          
          // Safe Check: Prevent crash if environment variable has typo
          const secret = process.env.JWT_SECRET || process.env.JWT_SSECRET;
          
          if (!secret) {
            console.error('❌ CRITICAL: No JWT Secret found in environment variables!');
          }
          
          console.log('Verifying token with secret exists:', !!secret);
          
          try {
            const decoded = jwt.verify(
              token, 
              secret || 'fallback-secret-change-in-production'
            );
            
            // Validate decoded JWT token structure - must be an admin token
            if (decoded && (decoded.id === 'admin' || decoded.isAdmin)) {
              user = { 
                _id: 'admin', 
                isAdmin: true, 
                displayName: 'MasterAdmin',
                role: 'admin'
              };
              isAdminAuth = true;
            } else {
              // Token decoded but not an admin token - this is a regular player JWT
              // Do NOT treat as admin, just continue without setting user (will fall through to Telegram auth or reject)
              console.log('ℹ️ Valid JWT but not admin credentials - treating as regular player');
              // Don't set user here - allow other auth methods or reject
            }
          } catch (jwtError) {
            console.warn('⚠️ JWT verification failed:', jwtError.message);
            // For Bearer tokens, we do NOT fall back to Base64 decoding
            // This prevents "Invalid Base64" errors and security issues
            return res.status(401).json({ error: 'Invalid session. Please login again.' });
          }
        } catch (tokenError) {
          console.warn('⚠️ Admin token processing error:', tokenError.message);
          return res.status(401).json({ error: 'Invalid session. Please login again.' });
        }
      }
    }

    // ❌ No valid authentication method found
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // 🛡️ FINAL SAFEGUARD: Ensure regular Telegram users are NEVER flagged as admin
    if (user.telegramId || (user._id && user._id !== 'admin')) {
      // This is a regular player - explicitly set isAdminAuth to false
      isAdminAuth = false;
      user.isAdmin = false;
      console.log('✅ Regular player authenticated:', user._id, 'telegramId:', user.telegramId);
    } else if (user._id === 'admin') {
      console.log('👮 Admin authenticated');
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
