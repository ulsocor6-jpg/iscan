import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  referenceId: String,
  amount: Number,
  status: String,
  channel: String,

  senderName: String,
  senderPhone: String,

  createdAt: Date,
  creditedAt: Date,
  expiredAt: Date,

  metadata: Object
}, {
  timestamps: true
});

schema.index({ referenceId: 1 });
schema.index({ status: 1 });
schema.index({ createdAt: -1 });
export default mongoose.model(
  "DepositLog",
  schema
);
