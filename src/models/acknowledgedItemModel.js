// src/models/acknowledgedItemModel.js
// Tracks which transaction items a user has "read" (expanded/viewed) in
// UserTools. Once acknowledged, an item is excluded from the live list AND
// from healthScore/summary counts in getUserDashboard, and instead only
// shows up under the History tab. Kept as its own tiny collection rather
// than adding an "acknowledged" field to DirectDeposit/WithdrawalRequest/
// FlowerOrder/Inspector — avoids touching 4 existing schemas for a
// per-user, UI-only concern.

import mongoose from "mongoose";

const acknowledgedItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  itemKey: { type: String, required: true }, // e.g. "deposit:<id>", "swap:<orderId>", "flow:<flowId>"
  acknowledgedAt: { type: Date, default: Date.now },
});

acknowledgedItemSchema.index({ userId: 1, itemKey: 1 }, { unique: true });

export default mongoose.model("AcknowledgedItem", acknowledgedItemSchema);
