import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema(
{
  referenceId: {
    type: String,
    required: true,
    index: true
  },

  ledgerGroupId: {
    type: String,
    required: true,
    index: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  accountType: {
    type: String,
    enum: [
      'USER',
      'TREASURY',
      'SETTLEMENT',
      'FEE',
      'RESERVE'
    ],
    default: 'USER',
    index: true
  },

  entryType: {
    type: String,
    enum: [
      'DEBIT',
      'CREDIT'
    ],
    required: true
  },

  transactionType: {
    type: String,
    enum: [
      'transfer',
      'cashin',
      'cashout',
      'remittance',
      'swap',
      'fee',
      'freeze',
      'unfreeze'
    ],
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
    default: 'PHP',
    index: true
  },

  originalAmount: {
    type: Number,
    default: null
  },

  originalCurrency: {
    type: String,
    default: null
  },

  phpRate: {
    type: Number,
    default: null
  },

  provider: {
    type: String,
    default: null
  },

  providerReference: {
    type: String,
    default: null
  },

  reversalOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ledger',
    default: null
  },

  description: {
    type: String,
    default: ''
  },

  status: {
    type: String,
    enum: [
      'pending',
      'reserved',
      'completed',
      'failed',
      'reversed',
      'frozen'
    ],
    default: 'completed',
    index: true
  },

  counterpartyAddress: {
    type: String,
    default: null
  },

  counterpartyEmail: {
    type: String,
    default: null
  },

  metadata: {
    type: Object,
    default: {}
  }
},
{
  timestamps: true
}
);

// Compound indexes (single-field indexes already defined inline above)
ledgerSchema.index({ userId: 1, currency: 1 });
ledgerSchema.index({ userId: 1, status: 1 });

export default mongoose.model(
  'Ledger',
  ledgerSchema
);
