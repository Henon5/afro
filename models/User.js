/**
 * User Model
 * Represents a user in the bingo game system
 * @module models/User
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { 
    type: String, 
    unique: true, 
    sparse: true,
    index: true
  },
  username: { 
    type: String, 
    trim: true 
  },
  firstName: { 
    type: String, 
    trim: true 
  },
  lastName: { 
    type: String, 
    trim: true 
  },
  phone: { 
    type: String, 
    trim: true 
  },
  telegramHandle: { 
    type: String, 
    trim: true 
  },
  balance: { 
    type: Number, 
    default: 0, 
    min: 0,
    validate: {
      validator: function(value) {
        return value >= 0;
      },
      message: 'Balance cannot be negative'
    }
  },
  totalWins: { 
    type: Number, 
    default: 0,
    min: 0
  },
  totalWinnings: { 
    type: Number, 
    default: 0,
    min: 0
  },
  gamesPlayed: { 
    type: Number, 
    default: 0,
    min: 0
  },
  isBlocked: { 
    type: Boolean, 
    default: false 
  },
  lastActive: { 
    type: Date, 
    default: Date.now 
  },
  registeredAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for efficient queries on active users
userSchema.index({ lastActive: -1 });

/**
 * Virtual property for display name
 * Returns firstName, username, telegramHandle, or 'Player' in that order of preference
 */
userSchema.virtual('displayName').get(function() {
  return this.firstName || this.username || this.telegramHandle || 'Player';
});

module.exports = mongoose.model('User', userSchema);
