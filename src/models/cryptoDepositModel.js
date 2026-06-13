import mongoose from 'mongoose';

const cryptoDepositSchema = new mongoose.Schema(
{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  referenceId: {
    type: String,
    required: true,
    unique: true
  },

  token: {
    type: String,
    enum: ['USDC', 'USDT'],
    required: true
  },

  usdAmount: {
    type: Number,
    required: true
  },

  expectedAddress: {
    type: String,
    required: true
  },

  chainId: {
    type: String,
    default: '0x1'
  },

  channel: {
    type: String,
    enum: ['maya', 'gcash'],
    required: true
  },

  mobileNumber: {
    type: String,
    required: true
  },

  detectedTxHash: {
    type: String,
    default: null
  },

  confirmations: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    enum: [
      'waiting_deposit',
      'deposit_detected',
      'confirming',
      'processing',
      'completed',
      'failed'
    ],
    default: 'waiting_deposit'
  },

  metadata: {
    type: Object,
    default: {}
  }
},
{
  timestamps: true
});

export default mongoose.model(
  'CryptoDeposit',
  cryptoDepositSchema
);
