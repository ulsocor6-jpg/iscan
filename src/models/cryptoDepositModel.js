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
    },

    token: {
      type: String,
      required: true,
      enum: ["USDC", "USDT"],
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

    creditedAt: {
      type: Date,
    },

    error: {
      type: String,
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
