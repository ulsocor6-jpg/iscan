import mongoose from 'mongoose';

const ledgerEntrySchema = new mongoose.Schema(
  {
    entryId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      index: true
    },

    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    direction: {
      type: String,
      enum: ['DEBIT', 'CREDIT'],
      required: true,
      index: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    currency: {
      type: String,
      default: 'PHP',
      index: true
    },

    balanceBefore: {
      type: Number,
      required: true
    },

    balanceAfter: {
      type: Number,
      required: true
    },

    description: {
      type: String,
      default: ''
    },

    referenceType: {
      type: String,
      enum: ['transfer', 'deposit', 'withdrawal', 'fee', 'adjustment', 'remittance'],
      required: true
    },

    referenceId: {
      type: String,
      index: true
    },

    status: {
      type: String,
      enum: ['POSTED', 'REVERSED'],
      default: 'POSTED',
      index: true
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

/**
 * Indexes for fast financial queries
 */
ledgerEntrySchema.index({ userId: 1, createdAt: -1 });
ledgerEntrySchema.index({ walletId: 1, createdAt: -1 });
ledgerEntrySchema.index({ transactionId: 1 });

export default mongoose.model('LedgerEntry', ledgerEntrySchema);
