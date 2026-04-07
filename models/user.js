const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true, index: true },
  username: String,
  firstName: { type: String, required: true },
  lastName: String,
  phone: { type: String, sparse: true },
  telegramHandle: String,
  
  // Game Data
  balance: { type: Number, default: 0, min: 0 },
  selectedRoom: { type: Number, default: 20, enum: [20, 50, 100] },
  totalWins: { type: Number, default: 0 },
  totalWinnings: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  
  // Security
  isBlocked: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  
  // Metadata
  lastActive: { type: Date, default: Date.now },
  registeredAt: { type: Date, default: Date.now },
  ipAddress: String,
  userAgent: String
}, { timestamps: true });

// Index for fast lookups
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ telegramHandle: 1 }, { sparse: true });

module.exports = mongoose.model('User', userSchema);