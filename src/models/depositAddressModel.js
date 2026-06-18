import mongoose from 'mongoose';

const depositAddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    chain: {
      type: String,
      required: true,
      default: 'tron'
    },

    token: {
      type: String,
      required: true,
      default: 'USDT'
    },

    address: {
      type: String,
      required: true,
      unique: true
    },

    hdIndex: {
      type: Number,
      default: null,
      index: true
    },

    status: {
      type: String,
      enum: ['active', 'used', 'expired'],
      default: 'active'
    },

    lastTxHash: {
      type: String,
      default: null
    },

    lastAmount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model(
  'DepositAddress',
  depositAddressSchema
);
