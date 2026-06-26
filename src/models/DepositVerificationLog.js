import mongoose from "mongoose";

const schema = new mongoose.Schema({

  referenceId: {
    type: String,
    index: true
  },

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  channel: String,

  senderAccount: String,

  receiverAccount: String,

  requestedAmount: Number,

  receivedAmount: Number,

  verificationResult: {
    type: String,
    required: true,
    enum: [
      "MATCHED",
      "AMOUNT_MISMATCH",
      "SENDER_MISMATCH",
      "NO_ACTIVE_REQUEST",
      "MULTIPLE_MATCHES",
      "MANUAL_REVIEW"
    ]
  },

  rawPayload: {
    type: mongoose.Schema.Types.Mixed
  },

  matchedAt: {
    type: Date,
    default: Date.now
  }

},{
  timestamps:true
});

schema.index({ referenceId: 1 });
schema.index({ verificationResult: 1 });
schema.index({ createdAt: -1 });

export default mongoose.model(
  "DepositVerificationLog",
  schema
);
