import mongoose from 'mongoose';

const transactionReservationSchema = new mongoose.Schema(
{
  reservationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null,
    index: true
  },

  referenceId: {
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

  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
    index: true
  },

  currency: {
    type: String,
    enum: ['PHP', 'USDC', 'ETH', 'MATIC'],
    required: true
  },

  amount: {
    type: Number,
    required: true,
    min: 0.00000001
  },

  status: {
    type: String,
    enum: [
      'ACTIVE',
      'CONSUMED',
      'RELEASED',
      'EXPIRED'
    ],
    default: 'ACTIVE',
    index: true
  },

  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + (15 * 60 * 1000))
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

transactionReservationSchema.index({
  userId: 1,
  status: 1
});

transactionReservationSchema.index({
  expiresAt: 1
});

export default mongoose.model(
  'TransactionReservation',
  transactionReservationSchema
);
