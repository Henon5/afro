const mongoose = require('mongoose');

const roomPoolSchema = new mongoose.Schema({
  roomAmount: { type: Number, required: true, enum: [5, 10, 20, 50, 100], unique: true, index: true },
  currentPool: { type: Number, default: 0, min: 0 },
  houseTotal: { type: Number, default: 0, min: 0 },
  players: [{ telegramId: { type: String, index: true }, joinedAt: { type: Date, default: Date.now } }],
  activeGame: { calledNumbers: [Number], startTime: Date, winner: String },
  totalGames: { type: Number, default: 0 },
  totalPaidOut: { type: Number, default: 0 }
}, { timestamps: true });

// Index for efficient room lookups
roomPoolSchema.index({ roomAmount: 1 });

roomPoolSchema.statics.initializeRooms = async function() {
  const rooms = [5, 10, 20, 50, 100];
  for (const amount of rooms) {
    await this.findOneAndUpdate({ roomAmount: amount }, { roomAmount: amount }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
};

module.exports = mongoose.model('RoomPool', roomPoolSchema);
