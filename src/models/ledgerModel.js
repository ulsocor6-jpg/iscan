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
    required: true
  },
  transactionType: {
    type: String,
    enum: [
      'transfer', 'deposit', 'withdrawal', 'fee',
      'crypto_onramp', 'crypto_offramp', 'crypto_deposit',
      'settlement', 'freeze', 'cash_in', 'cash_out', 'cashout', 'cashin',
      'remittance', 'adjustment', 'rewards', 'swap',
      'credit', 'debit', 'p2p', 'cashout_request', 'cashout_debit', 'cashout_settlement', 'cashout_fee', 'cashout_refund', 'flower_swap', 'balance_correction'
    ],
    required: true
  },
  debit:               { type: Number, default: 0 },
  credit:              { type: Number, default: 0 },
  currency:            { type: String, default: 'PHP' },
  description:         { type: String, default: '' },
  counterpartyAddress: { type: String, default: null },
  source:              { type: String, default: null },
  destination:         { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed', 'frozen'],
    default: 'completed'
  },
  providerRef:   { type: String, default: null },
  failureReason: { type: String, default: null },
  metadata:      { type: Object, default: {} }
}, { timestamps: true });

ledgerSchema.index({ userId: 1, createdAt: -1 });
ledgerSchema.index({ referenceId: 1 });

export default mongoose.model('Ledger', ledgerSchema);
