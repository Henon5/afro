/**
 * Main server entry point
 * @module server
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

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

const app = express();

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
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
