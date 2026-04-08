const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdrawal', 'game_entry', 'winning', 'house_commission'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'ETB' },
  paymentMethod: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  metadata: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

transactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
