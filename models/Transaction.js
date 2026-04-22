/**
 * Transaction Model
 * Represents financial transactions in the bingo game system
 * @module models/Transaction
 */

const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'game_entry', 'winning', 'house_commission'], 
    required: true,
    index: true
  },
  amount: { 
    type: Number, 
    required: true,
    validate: {
      validator: function(value) {
        return typeof value === 'number' && !isNaN(value);
      },
      message: 'Amount must be a valid number'
    }
  },
  currency: { 
    type: String, 
    default: 'ETB' 
  },
  paymentMethod: { 
    type: String 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'completed'], 
    default: 'pending',
    index: true
  },
  approvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  metadata: { 
    type: Object, 
    default: {} 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: -1
  }
}, {
  timestamps: true
});

// Compound index for efficient user transaction history queries
transactionSchema.index({ userId: 1, createdAt: -1 });

// Index for filtering by status and date
transactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
