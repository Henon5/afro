/**
 * RoomPool Model
 * Manages bingo room pools and player participation
 * @module models/RoomPool
 */

const mongoose = require('mongoose');

const roomPoolSchema = new mongoose.Schema({
  roomAmount: { 
    type: Number, 
    required: true, 
    enum: [20, 50, 100], 
    unique: true,
    index: true
  },
  currentPool: { 
    type: Number, 
    default: 0, 
    min: 0,
    validate: {
      validator: function(value) {
        return value >= 0;
      },
      message: 'Pool cannot be negative'
    }
  },
  houseTotal: { 
    type: Number, 
    default: 0, 
    min: 0,
    validate: {
      validator: function(value) {
        return value >= 0;
      },
      message: 'House total cannot be negative'
    }
  },
  players: [{ 
    telegramId: { type: String, index: true }, 
    joinedAt: { type: Date, default: Date.now } 
  }],
  activeGame: { 
    calledNumbers: [Number], 
    startTime: Date, 
    winner: String 
  },
  totalGames: { 
    type: Number, 
    default: 0,
    min: 0
  },
  totalPaidOut: { 
    type: Number, 
    default: 0,
    min: 0
  }
}, { 
  timestamps: true 
});

/**
 * Initialize room pools for all bet amounts
 * Creates documents for rooms with amounts 20, 50, and 100 if they don't exist
 * @returns {Promise<void>}
 */
roomPoolSchema.statics.initializeRooms = async function() {
  const roomAmounts = [20, 50, 100];
  
  for (const amount of roomAmounts) {
    await this.findOneAndUpdate(
      { roomAmount: amount },
      { roomAmount: amount },
      { 
        upsert: true, 
        new: true, 
        setDefaultsOnInsert: true 
      }
    );
  }
};

module.exports = mongoose.model('RoomPool', roomPoolSchema);
