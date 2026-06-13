import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  referenceId: {
    type: String,
    required: true,
    index: true
  },

  transactionType: {
    type: String,
    enum: ['transfer', 'deposit', 'withdrawal', 'fee'],
    required: true
  },

  debit: {
    type: Number,
    default: 0
  },

  credit: {
    type: Number,
    default: 0
  },

  currency: {
    type: String,
    default: 'PHP'
  },

  description: {
    type: String,
    default: ''
  },

  counterpartyAddress: {
    type: String,
    default: null
  },

  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed'
  },

  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

export default mongoose.model('Ledger', ledgerSchema);
