const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, sparse: true },
  username: String,
  firstName: String,
  lastName: String,
  phone: { type: String, trim: true },
  telegramHandle: String,
  languageCode: String,
  photoUrl: String,
  allowsWriteToPm: Boolean,
  balance: { type: Number, default: 0, min: 0 },
  totalWins: { type: Number, default: 0 },
  totalWinnings: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  isBlocked: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now },
  registeredAt: { type: Date, default: Date.now }
}, { timestamps: true });

userSchema.virtual('displayName').get(function() {
  return this.firstName || this.username || this.telegramHandle || 'Player';
});

module.exports = mongoose.model('User', userSchema);
