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
    // 'EOA' = legacy HD-derived wallet with a private key (needs gas
    // pre-funded before it can sweep itself). 'FORWARDER' = CREATE2
    // smart-contract address with no private key (sweeps via the
    // factory's deploy()/sweep() call, operator pays gas, no funding
    // step needed). Existing records predate this field and are always
    // treated as 'EOA' by application code even where this is undefined
    // \u2014 the default here only affects newly created records.
    addressType: {
      type: String,
      enum: ['EOA', 'FORWARDER'],
      default: 'EOA'
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
