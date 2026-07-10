import mongoose from "mongoose";
import { alertCashoutAwaitingRelease } from "../services/telegramAlertService.js";
import eventStreamService from "../services/eventStreamService.js";

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
  processAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  adminNote: { type: String, default: "" }
}, { timestamps: true });

schema.post("save", function (doc, next) {
  if (doc.wasNew) {
    alertCashoutAwaitingRelease(doc).catch(err => {
      console.error("[CashoutRequest] Telegram alert failed:", err.message);
    });

    eventStreamService.emit("withdrawal.verified", {
      entityId: doc.referenceId || doc._id.toString(),
      userId: doc.userId ? doc.userId.toString() : null,
      cashoutId: doc._id.toString(),
      referenceId: doc.referenceId,
      amount: doc.amount,
      fee: doc.fee,
      netAmount: doc.netAmount,
      destinationType: doc.destinationType,
      destinationAccount: doc.destinationAccount,
      message: `Cashout request verified and awaiting admin release — ₱${(doc.netAmount ?? doc.amount ?? 0).toFixed(2)} to ${doc.destinationType || "—"} (${doc.destinationAccount || "—"})`,
    }).catch(err => {
      console.error("[CashoutRequest] System Inspector event emit failed:", err.message);
    });
  }
  next();
});

schema.pre("save", function (next) {
  this.wasNew = this.isNew;
  next();
});

export default mongoose.model("CashoutRequest", schema);
