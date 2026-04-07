const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  telegramId: { type: String, required: true, index: true },
  
  type: { type: String, enum: ['deposit', 'withdrawal'], required: true },
  amount: { type: Number, required: true, min: 1 },
  
  // Payment Details
  paymentMethod: { type: String, enum: ['telebirr', 'cbe', 'manual'], required: true },
  referenceNumber: String, // TeleBirr/CBE transaction ID
  senderPhone: String,
  
  // Status Flow
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'completed'], 
    default: 'pending' 
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  reviewedAt: Date,
  rejectionReason: String,
  
  // Metadata
  ipAddress: String,
  userAgent: String,
  notes: String
}, { timestamps: true });

// Compound index for admin queries
transactionSchema.index({ telegramId: 1, status: 1, type: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);