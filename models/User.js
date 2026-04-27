const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, sparse: true, index: true },
  username: { type: String, index: true },
  firstName: String,
  lastName: String,
  phone: { type: String, trim: true },
  telegramHandle: String,
  balance: { type: Number, default: 0, min: 0, index: true },
  totalWins: { type: Number, default: 0 },
  totalWinnings: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  isAdmin: { type: Boolean, default: false, index: true },
  isBlocked: { type: Boolean, default: false, index: true },
  lastActive: { type: Date, default: Date.now, index: true },
  registeredAt: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for common query patterns
userSchema.index({ telegramId: 1, isBlocked: 1 });
userSchema.index({ balance: -1, isBlocked: 1 });
userSchema.index({ lastActive: -1 });

userSchema.virtual('displayName').get(function() {
  return this.firstName || this.username || this.telegramHandle || 'Player';
});

module.exports = mongoose.model('User', userSchema);
