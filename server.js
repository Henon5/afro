/**
 * Main server entry point
 * @module server
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// Configuration
const { PORT = 3000, FRONTEND_URL, HOUSE_COMMISSION = '0.1' } = process.env;

// Import modules
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const RoomPool = require('./models/RoomPool');

// Route imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const gameRoutes = require('./routes/game');
const transactionRoutes = require('./routes/transaction');
const adminRoutes = require('./routes/admin');
const cartelRoutes = require('./routes/cartel');

const app = express();
const server = http.createServer(app);

/**
 * Socket.io configuration for real-time gameplay
 */
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Store active game sessions and their sockets
const gameSessions = new Map(); // sessionId -> Set of socket ids
const socketToGame = new Map(); // socket id -> sessionId

/**
 * Socket.io connection handler
 */
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Join a game room
  socket.on('join-game', async ({ sessionId, token }) => {
    try {
      const GameSession = require('./models/GameSession');
      const jwt = require('jsonwebtoken');
      
      // Verify token
      let userId;
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        userId = decoded._id || decoded.id;
      } catch (err) {
        socket.emit('error', { message: 'Authentication failed' });
        return;
      }

      // Verify game session exists and is active
      const gameSession = await GameSession.findOne({ 
        _id: sessionId, 
        gameStatus: { $in: ['waiting', 'active'] }
      });

      if (!gameSession) {
        socket.emit('error', { message: 'Game session not found or not active' });
        return;
      }

      // Check if user is in this game
      const player = gameSession.players.find(p => p.user.toString() === userId);
      if (!player) {
        socket.emit('error', { message: 'You are not in this game' });
        return;
      }

      // Join the socket room
      socket.join(sessionId);
      
      // Track this socket
      if (!gameSessions.has(sessionId)) {
        gameSessions.set(sessionId, new Set());
      }
      gameSessions.get(sessionId).add(socket.id);
      socketToGame.set(socket.id, sessionId);

      // Send current game state
      socket.emit('game-state', {
        sessionId: gameSession._id,
        calledNumbers: gameSession.calledNumbers,
        currentNumber: gameSession.currentNumber,
        gameStatus: gameSession.gameStatus,
        playersCount: gameSession.players.length
      });

      // Notify others in the room
      socket.to(sessionId).emit('player-joined', {
        playerId: userId,
        playersCount: gameSession.players.length
      });

      console.log(`🎮 Player ${userId} joined game ${sessionId}`);
    } catch (err) {
      console.error('Join game error:', err);
      socket.emit('error', { message: 'Failed to join game' });
    }
  });

  // Handle number call (admin/host only)
  socket.on('call-number', async ({ sessionId }) => {
    try {
      const GameSession = require('./models/GameSession');
      
      const gameSession = await GameSession.findOne({ 
        _id: sessionId, 
        gameStatus: 'active' 
      });

      if (!gameSession) {
        socket.emit('error', { message: 'Game not found or not active' });
        return;
      }

      // Check if all numbers called
      if (gameSession.calledNumbers.length >= 75) {
        socket.emit('number-called', { complete: true });
        return;
      }

      // Generate available numbers
      const calledSet = new Set(gameSession.calledNumbers);
      const available = [];
      for (let i = 1; i <= 75; i++) {
        if (!calledSet.has(i)) available.push(i);
      }

      if (available.length === 0) {
        socket.emit('number-called', { complete: true });
        return;
      }

      // Pick random number
      const nextNumber = available[Math.floor(Math.random() * available.length)];
      gameSession.calledNumbers.push(nextNumber);
      gameSession.currentNumber = nextNumber;
      await gameSession.save();

      const letter = ['B','I','N','G','O'][Math.floor((nextNumber - 1) / 15)];

      // Broadcast to all in room
      io.to(sessionId).emit('number-called', {
        number: nextNumber,
        display: `${letter}-${nextNumber}`,
        callCount: gameSession.calledNumbers.length,
        complete: available.length <= 1
      });

      console.log(`📢 Number called: ${nextNumber} in game ${sessionId}`);
    } catch (err) {
      console.error('Call number error:', err);
      socket.emit('error', { message: 'Failed to call number' });
    }
  });

  // Handle mark number
  socket.on('mark-number', async ({ sessionId, row, col }) => {
    try {
      const GameSession = require('./models/GameSession');
      const jwt = require('jsonwebtoken');
      
      // Get user from token
      const token = socket.handshake.auth.token;
      let userId;
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        userId = decoded._id || decoded.id;
      } catch (err) {
        socket.emit('error', { message: 'Authentication failed' });
        return;
      }

      const gameSession = await GameSession.findOne({ 
        _id: sessionId, 
        gameStatus: 'active' 
      }).select('players calledNumbers');

      if (!gameSession) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const player = gameSession.players.find(p => p.user.toString() === userId);
      if (!player) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const num = player.cardGrid[row][col];
      if (!(row === 2 && col === 2) && !gameSession.calledNumbers.includes(num)) {
        socket.emit('error', { message: 'Number not called yet' });
        return;
      }

      player.markedState[row][col] = !player.markedState[row][col];
      await gameSession.save();

      const playerIndex = gameSession.players.indexOf(player);
      const winResult = gameSession.checkWin(playerIndex);

      // Send confirmation to sender
      socket.emit('number-marked', {
        marked: player.markedState[row][col],
        matches: player.markedState.flat().filter(Boolean).length - 1,
        win: winResult.win,
        pattern: winResult.pattern
      });

      // Notify others (optional - could be used for spectators)
      socket.to(sessionId).emit('player-marked', {
        playerId: userId,
        matches: player.markedState.flat().filter(Boolean).length - 1
      });
    } catch (err) {
      console.error('Mark number error:', err);
      socket.emit('error', { message: 'Failed to mark number' });
    }
  });

  // Handle claim bingo
  socket.on('claim-bingo', async ({ sessionId }) => {
    try {
      const GameSession = require('./models/GameSession');
      const User = require('./models/User');
      const Transaction = require('./models/Transaction');
      const RoomPool = require('./models/RoomPool');
      const jwt = require('jsonwebtoken');
      
      // Get user from token
      const token = socket.handshake.auth.token;
      let userId;
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        userId = decoded._id || decoded.id;
      } catch (err) {
        socket.emit('error', { message: 'Authentication failed' });
        return;
      }

      const gameSession = await GameSession.findOne({ 
        _id: sessionId, 
        gameStatus: 'active' 
      }).select('players roomAmount');

      if (!gameSession) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }

      const playerIndex = gameSession.players.findIndex(p => p.user.toString() === userId);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Not in this game' });
        return;
      }

      const winResult = gameSession.checkWin(playerIndex);
      if (!winResult.win) {
        socket.emit('error', { message: 'No bingo pattern detected' });
        return;
      }

      // Atomic update to reset pool and get current value
      const roomPool = await RoomPool.findOneAndUpdate(
        { roomAmount: gameSession.roomAmount },
        { $set: { currentPool: 0, players: [] } },
        { new: true }
      );

      if (!roomPool) {
        socket.emit('error', { message: 'Room pool not found' });
        return;
      }

      const winnings = roomPool.currentPool + (roomPool.houseTotal || 0);

      // Atomic balance update
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { 
          $inc: { 
            balance: winnings, 
            totalWins: 1, 
            totalWinnings: winnings,
            gamesPlayed: 1 
          } 
        },
        { new: true, select: 'balance' }
      );

      // Create transaction
      await Transaction.create({ 
        userId, 
        type: 'winning', 
        amount: winnings, 
        status: 'completed' 
      });

      gameSession.gameStatus = 'completed';
      gameSession.completedAt = new Date();
      gameSession.winner = userId;
      gameSession.winningPattern = winResult.pattern;
      await gameSession.save();

      // Broadcast win to all players
      io.to(sessionId).emit('bingo-claimed', {
        winner: userId,
        winnings,
        pattern: winResult.pattern,
        newBalance: updatedUser.balance
      });

      console.log(`🏆 Bingo claimed by ${userId} in game ${sessionId}! Won ${winnings} ETB`);
    } catch (err) {
      console.error('Claim bingo error:', err);
      socket.emit('error', { message: 'Failed to claim bingo' });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    
    const sessionId = socketToGame.get(socket.id);
    if (sessionId) {
      const sessionSockets = gameSessions.get(sessionId);
      if (sessionSockets) {
        sessionSockets.delete(socket.id);
        
        // Notify others
        socket.to(sessionId).emit('player-left', { playerId: socket.id });
        
        // Clean up if no sockets left
        if (sessionSockets.size === 0) {
          gameSessions.delete(sessionId);
        }
      }
      socketToGame.delete(socket.id);
    }
  });
});

/**
 * Initialize application dependencies
 */
const initializeApp = async () => {
  try {
    await Promise.all([
      connectDB(),
      RoomPool.initializeRooms().catch(console.error)
    ]);
    console.log('✅ Application initialized successfully');
  } catch (error) {
    console.error('❌ Application initialization failed:', error.message);
  }
};

initializeApp();

/**
 * Security middleware configuration
 */
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
        "https://*.jsdelivr.net"
      ],
      scriptSrcElem: [
        "'self'",
        "'unsafe-inline'",
        "https://telegram.org",
        "https://cdn.jsdelivr.net",
        "https://cdn.socket.io",
        "https://*.jsdelivr.net"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net"
      ],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'", 
        "https:", 
        "http://localhost:*",
        "wss:",
        "ws:"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'", "https://t.me", "*"]
    }
  }
}));

app.use(cors({ 
  origin: FRONTEND_URL || '*', 
  credentials: true 
}));

app.use(express.json({ 
  limit: '10kb' // Limit body size for performance and security
}));

// Trust proxy for deployment behind reverse proxy (Railway, etc.)
app.set('trust proxy', 1);

/**
 * Rate limiting configuration
 * Prevents abuse and DoS attacks
 */
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  trustProxy: true,
  skipSuccessfulRequests: false,
  message: { error: 'Too many requests, please try again later' }
}));

/**
 * API Routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cartel', cartelRoutes);

/**
 * Static file serving
 */
app.use(express.static(path.join(__dirname)));

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

/**
 * Serve index.html for root route
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * 404 handler for undefined routes
 */
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

/**
 * Global error handler
 */
app.use(errorHandler);

/**
 * Start server
 */
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔌 Socket.io ready for real-time gameplay`);
});

// Export io for use in routes if needed
module.exports = { app, server, io };
