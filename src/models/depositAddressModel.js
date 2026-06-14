import mongoose from 'mongoose';

const depositAddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    chain: {
      type: String,
      enum: ['ethereum', 'polygon', 'bnb', 'tron'],
      required: true
    },

    token: {
      type: String,
      default: 'USDT'
    },

    address: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },

    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

const DepositAddress =
  mongoose.models.DepositAddress ||
  mongoose.model('DepositAddress', depositAddressSchema);

export default DepositAddress;
