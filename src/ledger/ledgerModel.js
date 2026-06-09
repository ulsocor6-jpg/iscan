import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema(
  {
    ledgerId: {
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

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: ['PENDING', 'POSTED', 'FAILED', 'REVERSED'],
      default: 'PENDING',
      index: true
    },

    totalDebit: {
      type: Number,
      default: 0
    },

    totalCredit: {
      type: Number,
      default: 0
    },

    currency: {
      type: String,
      default: 'PHP',
      index: true
    },

    isBalanced: {
      type: Boolean,
      default: false
    },

    description: {
      type: String,
      default: ''
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
 * INDEXES FOR FINANCIAL QUERIES
 */
ledgerSchema.index({ transactionId: 1 });
ledgerSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Ledger', ledgerSchema);
