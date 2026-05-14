// middleware/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

console.log('🔐 [AUTH] Auth middleware loaded');
console.log('🔐 [AUTH] TELEGRAM_BOT_TOKEN exists:', !!process.env.TELEGRAM_BOT_TOKEN);
console.log('🔐 [AUTH] JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('🔐 [AUTH] ADMIN_MASTER_ID exists:', !!process.env.ADMIN_MASTER_ID);
console.log('🔐 [AUTH] ADMIN_IDS exists:', !!process.env.ADMIN_IDS);

// 🔐 Verify Telegram WebApp initData signature
const verifyTelegramData = (initData) => {
  console.log('🔍 [AUTH] Verifying Telegram data...');
  
  // Skip verification in development if no bot token is set
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
    console.warn('⚠️ [AUTH] TELEGRAM_BOT_TOKEN not set - skipping initData verification (DEV MODE)');
    // SECURITY FIX: In production, always require valid bot token
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ [AUTH] CRITICAL: Telegram verification disabled in production!');
      return false;
    }
    return true;
  }
  
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    console.log('🔍 [AUTH] Hash present:', !!hash);
    
    if (!hash) {
      console.error('❌ [AUTH] No hash found in initData');
      return false;
    }
    
    params.delete('hash');
    
    // Sort params alphabetically by key (Telegram requirement)
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    
    console.log('📝 [AUTH] Data check string created, length:', dataCheckString.length);
    
    // Generate secret key per Telegram docs
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN)
      .digest();
    
    console.log('🔑 [AUTH] Secret key generated');
    
    // Compute expected hash
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    console.log('🔍 [AUTH] Expected hash computed');
    
    // Ensure both hashes are same length before comparison
    if (hash.length !== expectedHash.length) {
      console.warn('⚠️ [AUTH] Hash length mismatch - received:', hash.length, 'expected:', expectedHash.length);
      return false;
    }
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
    
    console.log('✅ [AUTH] Telegram data validation result:', isValid ? 'VALID' : 'INVALID');
    return isValid;
  } catch (error) {
    console.error('❌ [AUTH] Telegram data verification error:', error.message);
    console.error('❌ [AUTH] Error stack:', error.stack);
    return false;
  }
};

// 👤 Process Telegram user data and upsert to database
const processTelegramUser = async (tgUser) => {
  console.log('👤 [AUTH] Processing Telegram user:', tgUser.id, tgUser.first_name);
  
  // Validate required fields
  if (!tgUser.id) {
    console.error('❌ [AUTH] Invalid Telegram user data - missing ID');
    throw new Error('Invalid Telegram user data - missing ID');
  }
  
  try {
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
    
    console.log('✅ [AUTH] User processed successfully:', user._id);
    return user;
  } catch (error) {
    console.error('❌ [AUTH] Database error processing user:', error.message);
    throw error;
  }
};

// 🔑 Main auth middleware - handles Telegram users AND admin
exports.auth = async (req, res, next) => {
  console.log('🔑 [AUTH] Auth middleware invoked for:', req.method, req.path);
  console.log('🔑 [AUTH] Headers received:', JSON.stringify({
    hasAuthHeader: !!req.headers['authorization'],
    hasTelegramHeader: !!req.headers['x-telegram-init-data'],
    hasAdminAuth: !!req.headers['x-admin-auth'],
    hasAdminToken: !!req.headers['x-admin-token']
  }));
  
  try {
    let user = null;
    let isAdminAuth = false;
    
    // Get authorization header
    const authHeader = req.headers['authorization'];
    
    // Log auth attempts without exposing sensitive data
    if (!authHeader || authHeader === 'null' || authHeader === 'undefined') {
      console.log('⚠️ [AUTH] No authorization header provided');
    } else {
      console.log('📝 [AUTH] Authorization header present (length:', authHeader.length, ')');
    }

    // 📱 Case 1: Telegram WebApp authentication via Authorization header
    // First, strip Bearer prefix if present (frontend bug fix)
    let authToken = authHeader;
    if (authToken && authToken.startsWith('Bearer ')) {
      console.log('✂️ [AUTH] Stripping Bearer prefix from token');
      authToken = authToken.substring(7); // Remove 'Bearer ' prefix
    }
    
    // Check if it's Telegram initData (starts with query_id= or user=, or contains hash=)
    if (authToken && (authToken.startsWith('query_id=') || authToken.startsWith('user=') || authToken.includes('hash='))) {
      console.log('📱 [AUTH] Attempting Telegram authentication via Authorization header');
      try {
        const initData = authToken;
        
        // Verify Telegram data signature
        console.log('🔍 [AUTH] Verifying Telegram initData signature...');
        if (!verifyTelegramData(initData)) {
          console.warn('❌ [AUTH] Invalid Telegram initData signature');
          return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        console.log('📝 [AUTH] User string present:', !!userStr);
        
        // Handle URL-encoded user string (Telegram sends it double-encoded sometimes)
        let decodedUserStr = userStr;
        if (userStr && userStr.startsWith('%7B')) {
          console.log('🔄 [AUTH] Decoding URL-encoded user string');
          try {
            decodedUserStr = decodeURIComponent(userStr);
          } catch (e) {
            console.warn('⚠️ [AUTH] URL decoding failed, using original');
          }
        }
        
        if (!decodedUserStr) {
          console.warn('❌ [AUTH] Missing user data in Telegram initData');
          return res.status(400).json({ error: 'Invalid Telegram data format' });
        }
        
        let tgUser;
        try {
          tgUser = JSON.parse(decodedUserStr);
          console.log('✅ [AUTH] Telegram user parsed successfully, ID:', tgUser.id);
        } catch (parseError) {
          console.error('❌ [AUTH] Failed to parse Telegram user data:', parseError.message);
          console.error('❌ [AUTH] Raw user string:', userStr?.substring(0, 100) + '...');
          return res.status(400).json({ error: 'Invalid Telegram user data format' });
        }
        
        user = await processTelegramUser(tgUser);
        
        isAdminAuth = false;
      } catch (telegramError) {
        console.error('❌ [AUTH] Telegram authentication error:', telegramError.message);
        console.error('❌ [AUTH] Stack:', telegramError.stack);
        return res.status(400).json({ error: 'Invalid Telegram authentication data' });
      }
    }
    // 📱 Case 2: Telegram WebApp authentication via X-Telegram-Init-Data header
    else if (req.headers['x-telegram-init-data']) {
      console.log('📱 [AUTH] Attempting Telegram authentication via X-Telegram-Init-Data header');
      try {
        const initData = req.headers['x-telegram-init-data'];
        
        // Verify Telegram data signature
        console.log('🔍 [AUTH] Verifying Telegram initData signature...');
        if (!verifyTelegramData(initData)) {
          console.warn('❌ [AUTH] Invalid Telegram initData');
          return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        console.log('📝 [AUTH] User string present:', !!userStr);
        
        // Handle URL-encoded user string (Telegram sends it double-encoded sometimes)
        let decodedUserStr = userStr;
        if (userStr && userStr.startsWith('%7B')) {
          console.log('🔄 [AUTH] Decoding URL-encoded user string');
          try {
            decodedUserStr = decodeURIComponent(userStr);
          } catch (e) {
            console.warn('⚠️ [AUTH] URL decoding failed, using original');
          }
        }
        
        if (!decodedUserStr) {
          console.warn('❌ [AUTH] Missing user data in Telegram initData');
          return res.status(400).json({ error: 'Invalid Telegram data format' });
        }
        
        let tgUser;
        try {
          tgUser = JSON.parse(decodedUserStr);
          console.log('✅ [AUTH] Telegram user parsed successfully, ID:', tgUser.id);
        } catch (parseError) {
          console.error('❌ [AUTH] Failed to parse Telegram user data:', parseError.message);
          console.error('❌ [AUTH] Raw user string:', userStr?.substring(0, 100) + '...');
          return res.status(400).json({ error: 'Invalid Telegram user data format' });
        }
        
        user = await processTelegramUser(tgUser);
        
        isAdminAuth = false;
      } catch (telegramError) {
        console.error('❌ [AUTH] Telegram authentication error:', telegramError.message);
        console.error('❌ [AUTH] Stack:', telegramError.stack);
        return res.status(400).json({ error: 'Invalid Telegram authentication data' });
      }
    } 
    // 👮 Case 3: Admin authentication via credentials (login request)
    else if (req.headers['x-admin-auth']) {
      console.log('👮 [AUTH] Attempting admin authentication via x-admin-auth header');
      try {
        const authHeader = req.headers['x-admin-auth'];
        
        // Validate header is valid JSON string before parsing
        if (typeof authHeader !== 'string' || !authHeader.trim().startsWith('{')) {
          console.warn('❌ [AUTH] Invalid admin auth header format');
          return res.status(400).json({ error: 'Invalid admin auth format' });
        }
        
        const { masterId, secureCode, securityKey } = JSON.parse(authHeader);
        console.log('📝 [AUTH] Admin credentials parsed, checking against env vars...');
        
        if (
          masterId === process.env.ADMIN_MASTER_ID &&
          secureCode === process.env.ADMIN_SECURE_CODE &&
          securityKey === process.env.ADMIN_SECURITY_KEY
        ) {
          console.log('✅ [AUTH] Admin credentials validated successfully');
          
          // Find or create admin user in database with real record
          const adminTelegramId = process.env.ADMIN_MASTER_ID; // Use master ID as telegramId
          user = await User.findOneAndUpdate(
            { telegramId: adminTelegramId },
            {
              $set: {
                username: 'admin',
                firstName: 'Admin',
                isAdmin: true,
                lastActive: Date.now()
              },
              $setOnInsert: {
                balance: 500000, // Initial admin balance
                gamesPlayed: 0,
                totalWins: 0
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          console.log('✅ [AUTH] Admin user retrieved/created in DB:', user._id);
          isAdminAuth = true;
        } else {
          console.warn('❌ [AUTH] Invalid admin credentials - mismatch with environment variables');
          console.warn('❌ [AUTH] ADMIN_MASTER_ID matches:', masterId === process.env.ADMIN_MASTER_ID);
          console.warn('❌ [AUTH] ADMIN_SECURE_CODE matches:', secureCode === process.env.ADMIN_SECURE_CODE);
          console.warn('❌ [AUTH] ADMIN_SECURITY_KEY matches:', securityKey === process.env.ADMIN_SECURITY_KEY);
          return res.status(401).json({ error: 'Invalid admin credentials' });
        }
      } catch (parseError) {
        console.error('❌ [AUTH] Admin auth header parse error:', parseError.message);
        console.error('❌ [AUTH] Stack:', parseError.stack);
        return res.status(400).json({ error: 'Invalid admin auth format' });
      }
    }
    // 🔑 Case 4: JWT authentication (Bearer token)
    else if (authHeader && authHeader.startsWith('Bearer ')) {
      console.log('🔑 [AUTH] Attempting JWT authentication');
      try {
        const token = authHeader.split(' ')[1];
        console.log('📝 [AUTH] Token extracted (length:', token?.length, ')');
        
        // Fast path: Validate token format before decoding
        if (!token || typeof token !== 'string' || token.length < 10) {
          console.warn('⚠️ [AUTH] Invalid token format');
          return res.status(401).json({ error: 'Invalid session. Please login again.' });
        }
        
        const secret = process.env.JWT_SECRET;
        
        if (!secret) {
          console.error('❌ [AUTH] CRITICAL: No JWT Secret found in environment variables!');
          return res.status(500).json({ error: 'Server configuration error' });
        }
        
        try {
          const decoded = jwt.verify(token, secret);
          console.log('✅ [AUTH] JWT verified successfully, payload:', JSON.stringify({ id: decoded.id, telegramId: decoded.telegramId }));
          
          // Check if this is an admin token
          if (decoded && (decoded.id === 'admin' || decoded.isAdmin)) {
            console.log('👮 [AUTH] Admin token detected');
            // Find or create admin user in database with real record
            const adminTelegramId = process.env.ADMIN_MASTER_ID; // Use master ID as telegramId
            user = await User.findOneAndUpdate(
              { telegramId: adminTelegramId },
              {
                $set: {
                  username: 'admin',
                  firstName: 'Admin',
                  isAdmin: true,
                  lastActive: Date.now()
                },
                $setOnInsert: {
                  balance: 500000, // Initial admin balance
                  gamesPlayed: 0,
                  totalWins: 0
                }
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log('✅ [AUTH] Admin user retrieved/created from JWT:', user._id);
            isAdminAuth = true;
          } 
          // Regular user JWT - find user by telegramId from token
          else if (decoded && decoded.telegramId) {
            console.log('👤 [AUTH] Regular user JWT detected, telegramId:', decoded.telegramId);
            user = await User.findOneAndUpdate(
              { telegramId: String(decoded.telegramId) },
              {
                $set: {
                  lastActive: Date.now()
                }
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log('✅ [AUTH] User retrieved/created from JWT:', user._id);
            isAdminAuth = false;
          } else {
            console.warn('⚠️ [AUTH] Valid JWT but missing telegramId - cannot identify user');
            return res.status(401).json({ error: 'Invalid token payload' });
          }
        } catch (jwtError) {
          console.warn('⚠️ [AUTH] JWT verification failed:', jwtError.name);
          if (jwtError.name === 'TokenExpiredError') {
            console.error('❌ [AUTH] Token Expired');
          } else if (jwtError.name === 'JsonWebTokenError') {
            console.error('❌ [AUTH] Invalid Token');
          } else {
            console.error('❌ [AUTH] JWT Error:', jwtError.name, jwtError.message);
          }
          return res.status(401).json({ error: 'Invalid session. Please login again.' });
        }
      } catch (tokenError) {
        console.warn('⚠️ [AUTH] JWT token processing error:', tokenError.message);
        console.error('❌ [AUTH] Stack:', tokenError.stack);
        return res.status(401).json({ error: 'Invalid session. Please login again.' });
      }
    }
    // 🔑 Case 5: Admin authentication via x-admin-token header
    else {
      console.log('🔑 [AUTH] Checking x-admin-token header');
      const adminToken = req.headers['x-admin-token'];
      
      // STRICT CHECK: Only set admin if token matches exactly
      if (adminToken && adminToken === process.env.ADMIN_SECRET_KEY) {
        console.log('✅ [AUTH] Admin token validated successfully');
        // Find or create admin user in database with real record
        const adminTelegramId = process.env.ADMIN_MASTER_ID; // Use master ID as telegramId
        user = await User.findOneAndUpdate(
          { telegramId: adminTelegramId },
          {
            $set: {
              username: 'admin',
              firstName: 'Admin',
              isAdmin: true,
              lastActive: Date.now()
            },
            $setOnInsert: {
              balance: 500000, // Initial admin balance
              gamesPlayed: 0,
              totalWins: 0
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log('✅ [AUTH] Admin user retrieved/created from x-admin-token:', user._id);
        isAdminAuth = true;
      } else {
        console.log('⚠️ [AUTH] No valid authentication method found');
      }
    }

    // ❌ No valid authentication method found
    if (!user) {
      console.warn('❌ [AUTH] Authentication failed - no valid credentials');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // 🛡️ FINAL SAFEGUARD: Check admin status
    // Admin access is granted if:
    // 1. User is authenticated via admin credentials/token (isAdminAuth already true)
    // 2. User's telegramId OR _id is in the ADMIN_IDS environment variable
    if (user.telegramId || (user._id && user._id !== 'admin')) {
      // Check if this user's telegramId OR _id is in the admin list
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
      const userIdToCheck = String(user._id);
      const telegramIdToCheck = user.telegramId ? String(user.telegramId) : null;
      
      console.log('🛡️ [AUTH] Checking admin status - user._id:', userIdToCheck, 'telegramId:', telegramIdToCheck);
      console.log('🛡️ [AUTH] ADMIN_IDS list:', adminIds);
      
      // Check both _id and telegramId against admin list
      const isAdminById = adminIds.includes(userIdToCheck);
      const isAdminByTelegramId = telegramIdToCheck && adminIds.includes(telegramIdToCheck);
      
      if (isAdminById || isAdminByTelegramId) {
        console.log('✅ [AUTH] User granted admin access based on ID match');
        // This user is an admin based on their Telegram ID or User ID
        isAdminAuth = true;
        user.isAdmin = true;
      } else {
        console.log('👤 [AUTH] User is a regular player (not admin)');
        // This is a regular player - explicitly set isAdminAuth to false
        isAdminAuth = false;
        // Keep existing isAdmin value from DB, don't override to false
      }
    } else if (user._id === 'admin') {
      console.log('👮 [AUTH] Admin authenticated via credentials');
    }

    // 🚫 Check if user is blocked (skip for admin)
    if (user.isBlocked && !user.isAdmin) {
      console.warn('🚫 [AUTH] User account is blocked:', user._id);
      return res.status(403).json({ error: 'Account is blocked' });
    }

    // ✅ Attach user to request and proceed
    req.user = user;
    req.isAdminAuth = isAdminAuth; // Flag to indicate admin auth (not a real DB user)
    console.log('✅ [AUTH] Authentication successful - user:', user._id, 'isAdmin:', isAdminAuth);
    next();
    
  } catch (error) {
    console.error('❌ [AUTH] Auth middleware error:', error.message);
    console.error('❌ [AUTH] Stack:', error.stack);
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
