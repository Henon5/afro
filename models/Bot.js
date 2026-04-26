const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  telegramId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 1000, min: 0 },
  totalWins: { type: Number, default: 0 },
  totalWinnings: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  lastPlayed: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bot', botSchema);
