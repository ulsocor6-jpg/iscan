import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false
  },

  address: String,

  chain: String,

  asset: String,

  amount: Number,

  txHash: {
    type: String,
    unique: true
  },

  confirmations: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    enum: [
      "pending_review",
      "approved",
      "rejected"
    ],
    default: "pending_review"
  }

}, {
  timestamps: true
});

export default mongoose.model(
  "DepositReview",
  schema
);
