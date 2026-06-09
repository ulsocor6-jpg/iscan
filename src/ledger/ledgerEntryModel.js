const mongoose = require('mongoose');

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

    type: {
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
      default: 'PHP'
    },

    balanceAfter: {
      type: Number,
      required: true
    },

    description: {
      type: String,
      default: ''
    },

    metadata: {
      type: Object,
      default: {}
    },

    status: {
      type: String,
      enum: ['POSTED', 'REVERSED'],
      default: 'POSTED',
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
