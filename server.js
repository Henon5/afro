// Log immediately as the first line of code
console.log('🚀 [SERVER] Server is starting...');
console.log('🚀 [SERVER] NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('🚀 [SERVER] PORT:', process.env.PORT || 3000);
console.log('🔐 [SERVER] Environment variables check:');
console.log('  - MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('  - JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('  - TELEGRAM_BOT_TOKEN exists:', !!process.env.TELEGRAM_BOT_TOKEN);
console.log('  - ADMIN_MASTER_ID exists:', !!process.env.ADMIN_MASTER_ID);
console.log('  - ADMIN_SECURE_CODE exists:', !!process.env.ADMIN_SECURE_CODE);
console.log('  - ADMIN_SECURITY_KEY exists:', !!process.env.ADMIN_SECURITY_KEY);
console.log('  - ADMIN_SECRET_KEY exists:', !!process.env.ADMIN_SECRET_KEY);
console.log('  - ADMIN_IDS exists:', !!process.env.ADMIN_IDS);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const RoomPool = require('./models/RoomPool');
const { initializeBots, startDailyBotReset } = require('./utils/botManager');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: ['https://henon5.github.io', 'https://afro-pxbt.onrender.com', 'http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// EMERGENCY ROOM RESET: Flush all rooms on startup to clear any overflow (42 players issue)
async function performEmergencyReset() {
  try {
    const RoomPool = require('./models/RoomPool');
    const GameSession = require('./models/GameSession');
    
    console.log('🔧 Performing Emergency Room Reset on startup...');
    
    // Reset all RoomPool player arrays and currentPool to 0
    await RoomPool.updateMany({}, {
      $set: { 
        currentPool: 0,
        houseTotal: 0,
        players: []
      }
    });
    
    // Clear all active game sessions
    await GameSession.updateMany(
      { gameStatus: { $in: ['waiting', 'active'] } },
      { 
        $set: { 
          gameStatus: 'completed',
          completedAt: new Date(),
          players: []
        } 
      }
    );
    
    console.log('✅ Emergency Room Reset Complete - All rooms flushed\n');
  } catch (err) {
    console.error('⚠️ Emergency Reset Warning:', err.message);
    // Non-critical, continue startup
  }
}

// CORS Configuration - Allow GitHub Pages origin with credentials
app.use(cors({ 
  origin: ['https://henon5.github.io', 'https://afro-pxbt.onrender.com'], 
  credentials: true 
}));

// Enable gzip compression for all responses (performance optimization)
app.use(compression({
  level: 6, // Balanced compression level (1-9, higher = better compression but slower)
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Connect DB and initialize rooms and bots in parallel with proper error handling
const initPromise = Promise.all([
  connectDB().catch(err => {
    console.error('❌ Database connection failed:', err.message);
    throw err;
  }),
  // Perform emergency reset AFTER database connection but BEFORE room initialization
  performEmergencyReset(),
  RoomPool.initializeRooms().catch(err => {
    console.error('❌ Room initialization failed:', err.message);
    // Non-critical, continue
  }),
  initializeBots().catch(err => {
    console.error('❌ Bot initialization failed:', err.message);
    // Non-critical, continue
  })
]).catch(err => {
  console.error('❌ Initialization failed:', err.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://telegram.org", 
        "https://cdn.jsdelivr.net", 
        "https://cdn.socket.io",
        "https://*.jsdelivr.net",
        "https://afro-pxbt.onrender.com"
      ],
      scriptSrcElem: [
        "'self'",
        "'unsafe-inline'",
        "https://telegram.org",
        "https://cdn.jsdelivr.net",
        "https://cdn.socket.io",
        "https://*.jsdelivr.net",
        "https://afro-pxbt.onrender.com"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net",
        "https://afro-pxbt.onrender.com"
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'", 
        "https:", 
        "http://localhost:*",
        "wss:",
        "ws:",
        "https://afro-pxbt.onrender.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'", "https://t.me", "https://afro-pxbt.onrender.com"]
    }
  }
}));
app.use(express.json({ limit: '10kb' })); // Limit body size for performance
// Trust Render's proxy
app.set('trust proxy', 1);

// Rate limiting with stricter limits for auth endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  trustProxy: true,
  skipSuccessfulRequests: false,
  message: { error: 'Too many requests, please try again later' }
});

// Stricter rate limit for authentication endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  trustProxy: true,
  message: { error: 'Too many login attempts, please try again after 15 minutes' }
});

app.use(generalLimiter);
// Apply stricter rate limiting to auth and admin login endpoints
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/admin', authLimiter, require('./routes/admin'));
app.use('/api/user', require('./routes/user'));
app.use('/api/game', require('./routes/game'));
app.use('/api/transaction', require('./routes/transaction'));

// Serve static files from current directory (for GitHub Pages deployment)
app.use(express.static(path.join(__dirname)));

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('*', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Socket.io Connection Handler
io.on('connection', (socket) => {
  console.log(`🔌 [SOCKET] Client connected: ${socket.id}`);
  
  // Join a game room
  socket.on('joinGame', (data) => {
    const sessionId = data.sessionId || data;
    socket.join(`game:${sessionId}`);
    console.log(`🔌 [SOCKET] Client ${socket.id} joined game ${sessionId}`);
  });
  
  // Legacy support for kebab-case event name
  socket.on('join-game', (sessionId) => {
    socket.join(`game:${sessionId}`);
    console.log(`🔌 [SOCKET] Client ${socket.id} joined game ${sessionId} (legacy)`);
  });
  
  // Leave a game room
  socket.on('leave-game', (sessionId) => {
    socket.leave(`game:${sessionId}`);
    console.log(`🔌 [SOCKET] Client ${socket.id} left game ${sessionId}`);
  });
  
  // Handle bingo claim via socket (for real-time validation)
  socket.on('bingoClaim', async (data) => {
    console.log(`🎯 [SOCKET] Bingo claim received from ${socket.id} for session:`, data.sessionId);
    // The actual claim processing happens via the /game/claim REST endpoint
    // This socket event is just for acknowledgment
    socket.emit('bingoClaimAck', { 
      sessionId: data.sessionId, 
      status: 'received',
      message: 'Claim received. Processing...'
    });
  });
  
  socket.on('disconnect', () => {
    console.log(`🔌 [SOCKET] Client disconnected: ${socket.id}`);
  });
});

// Export io for use in routes
module.exports = { app, server, io };

server.listen(PORT, () => {
  console.log(`✅ [SERVER] Server running on port ${PORT}`);
  console.log(`✅ [SERVER] Health check available at: /health`);
  console.log(`✅ [SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start daily bot balance reset scheduler (runs every 24 hours at midnight)
  startDailyBotReset(0, 0);
  console.log('⏰ [SERVER] Daily bot balance reset scheduler started (resets at 00:00 UTC)\n');
});

// Helper function for prize calculation with 15% house cut (Single Source of Truth)
function calculateRoomPrize(entryFee, totalPlayers) {
  const safeFee = Number(entryFee) || 0;
  const safePlayers = Number(totalPlayers) || 0;
  // Formula: (entryFee * totalPlayers) * 0.85, rounded down
  return Math.floor((safeFee * safePlayers) * 0.85);
}
