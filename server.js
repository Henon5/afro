const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const RoomPool = require('./models/RoomPool');
const path = require('path');

const app = express();

// Connect DB and initialize rooms in parallel
const initPromise = Promise.all([
  connectDB(),
  RoomPool.initializeRooms().catch(console.error)
]).catch(console.error);

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
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10kb' })); // Limit body size for performance
// Trust Railway's proxy
app.set('trust proxy', 1);

// Rate limiting with better defaults
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  trustProxy: true,
  skipSuccessfulRequests: false,
  message: { error: 'Too many requests, please try again later' }
}));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/game', require('./routes/game'));
app.use('/api/transaction', require('./routes/transaction'));
app.use('/api/admin', require('./routes/admin'));

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
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
