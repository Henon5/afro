require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const RoomPool = require('./models/RoomPool');

const app = express();
connectDB();
RoomPool.initializeRooms().catch(console.error);

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60000, max: parseInt(process.env.RATE_LIMIT_MAX) }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/game', require('./routes/game'));
app.use('/api/transaction', require('./routes/transaction'));
app.use('/api/admin', require('./routes/admin'));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('*', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
