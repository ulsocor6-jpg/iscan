import mongoose from "mongoose";
const schema = new mongoose.Schema(
{
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  asset: String,
amount: Number,
destinationAddress: String,
type: { type: String, enum: ['maya','bank','gcash','crypto'], default: 'maya' },
  network: { type: String, default: null },

  // ── PHP-specific fields (maya/bank/gcash types only) ──────────────────
  fee:                { type: Number, default: 0 },
  netAmount:          { type: Number, default: 0 },
  destinationAccount: { type: String, default: null }, // account number / mobile number
  accountName:        { type: String, default: null }, // linked account holder name
  referenceId:        { type: String, sparse: true, unique: true },
  approvedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User"
},
approvedAt: Date,
status: {
    type: String,
    enum: [
      "pending_review",
      "approved",
      "rejected",
      "completed",
      "failed"
    ],
    default: "pending_review"
  },
  txHash: { type: String, default: null },
  failReason: { type: String, default: null }
},
{
  timestamps: true
});
export default mongoose.model(
  "WithdrawalRequest",
  schema
);
