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
      "completed"
    ],
    default: "pending_review"
  }

},
{
  timestamps: true
});

export default mongoose.model(
  "WithdrawalRequest",
  schema
);
