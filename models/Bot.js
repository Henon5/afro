const mongoose = require('mongoose');

const botSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, index: true },
  telegramId: { type: String, required: true, unique: true, index: true },
  balance: { type: Number, default: 1000, min: 0, index: true },
  totalWins: { type: Number, default: 0 },
  totalWinnings: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true, index: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium', index: true },
  lastPlayed: { type: Date, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

// Compound indexes for common query patterns
botSchema.index({ isActive: 1, balance: -1 });
botSchema.index({ difficulty: 1, isActive: 1 });
botSchema.index({ telegramId: 1, isActive: 1 });

module.exports = mongoose.model('Bot', botSchema);
