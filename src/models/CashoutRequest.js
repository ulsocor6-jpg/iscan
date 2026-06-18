import mongoose from "mongoose";
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  amount: Number,
  fee: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  destinationType: {
    type: String,
    enum: ["MAYA", "COINSPH", "BANK", "GCASH", "AGENT"]
  },
  destinationAccount: String,
  referenceId: { type: String, unique: true, sparse: true },
  status: {
    type: String,
    enum: ["PENDING", "PROCESSING", "COMPLETED", "CANCELLED", "FAILED"],
    default: "PENDING"
  },
  processAt: { type: Date, default: null },   // when it moves to PROCESSING
  completedAt: { type: Date, default: null },  // when marked COMPLETED
  adminNote: { type: String, default: "" }
}, { timestamps: true });
export default mongoose.model("CashoutRequest", schema);
