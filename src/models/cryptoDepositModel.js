import mongoose from "mongoose";

const cryptoDepositSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    txHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    chain: {
      type: String,
      required: true,
      enum: ["base", "ronin"],
      index: true,
    },

    token: {
      type: String,
      required: true,
      enum: ["USDC", "USDT"],
      index: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    address: {
      type: String,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "processing",
        "completed",
        "failed",
      ],
      default: "processing",
      index: true,
    },

    // Treasury sweep information
    treasurySweepTx: {
      type: String,
      default: null,
      index: true,
    },

    sweptAmount: {
      type: Number,
      default: 0,
    },

    // Timing
    creditedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // Error tracking
    error: {
      type: String,
      default: null,
    },

    retryCount: {
      type: Number,
      default: 0,
    },

    lastRetryAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "CryptoDeposit",
  cryptoDepositSchema
);
