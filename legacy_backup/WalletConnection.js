import mongoose from 'mongoose';

const walletConnectionSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  provider: {
    type: String,
    required: true
  },

  address: {
    type: String,
    required: true
  },

  verified: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

export default mongoose.model(
  'WalletConnection',
  walletConnectionSchema
);
