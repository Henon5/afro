const mongoose = require('mongoose');

const gameRoomSchema = new mongoose.Schema({
  entryAmount: { type: Number, required: true, unique: true, enum: [20, 50, 100] },
  
  // Pool Management
  currentPool: { type: Number, default: 0, min: 0 },
  houseEarnings: { type: Number, default: 0, min: 0 },
  
  // Active Players (store telegramId for security)
  activePlayers: [{
    telegramId: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
    cardData: Object, // Store encrypted card if needed
    markedNumbers: [Number],
    hasClaimed: { type: Boolean, default: false }
  }],
  
  // Game State
  currentGame: {
    isActive: { type: Boolean, default: false },
    calledNumbers: [Number],
    startTime: Date,
    winner: { type: String, ref: 'User' }
  },
  
  // Statistics
  totalGames: { type: Number, default: 0 },
  totalPayouts: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('GameRoom', gameRoomSchema);