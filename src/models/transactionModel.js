import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
{
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  senderAddress: {
    type: String,
    required: true,
    index: true
  },

  receiverAddress: {
    type: String,
    required: true,
    index: true
  },

  receiverEmail: {
    type: String,
    default: null
  },

  amount: {
    type: Number,
    required: true,
    min: 0.00000001
  },

  currency: {
    type: String,
    enum: ['PHP', 'USDC', 'ETH', 'MATIC'],
    required: true,
    index: true
  },

  fee: {
    type: Number,
    default: 0
  },

  type: {
    type: String,
    enum: [
      'transfer',
      'cashin',
      'cashout',
      'remittance',
      'swap'
    ],
    default: 'transfer'
  },

  status: {
    type: String,
    enum: [
      'created',
      'validating',
      'fraud_check',
      'reserved',
      'processing',
      'settled',
      'failed',
      'reversed'
    ],
    default: 'created',
    index: true
  },

  fraudScore: {
    type: Number,
    default: 0
  },

  fraudRisk: {
    type: String,
    default: 'LOW'
  },

  ledgerGroupId: {
    type: String,
    required: true,
    index: true
  },

  reservationId: {
    type: String,
    default: null,
    index: true
  },

  settlementMethod: {
    type: String,
    enum: [
      'coinsph',
      'maya',
      'paymongo',
      'bank',
      'manual'
    ],
    default: 'manual'
  },

  settlementRef: {
    type: String,
    default: null
  },

  referenceId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },

  notes: {
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

// Compound indexes (single-field indexes already defined inline above)
transactionSchema.index({ senderId: 1, createdAt: -1 });
transactionSchema.index({ receiverId: 1, createdAt: -1 });

export default mongoose.model(
  'Transaction',
  transactionSchema
);
