import mongoose from "mongoose";

const DepositSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    chain: {
      type: String,
      required: true,
      index: true
    },

    token: {
      type: String,
      required: true,
      index: true
    },

    amount: {
      type: String,
      required: true
    },

    txHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    address: {
      type: String,
      required: true,
      index: true
    },

    blockNumber: {
      type: Number,
      required: true
    },

    confirmations: {
      type: Number,
      default: 0
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "CONFIRMED",
        "CREDITED",
        "FAILED"
      ],
      default: "PENDING",
      index: true
    },

    blockchainInboxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BlockchainInbox",
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model(
  "Deposit",
  DepositSchema
);
