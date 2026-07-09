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
