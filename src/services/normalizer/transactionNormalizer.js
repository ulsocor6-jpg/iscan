import mongoose from "mongoose";

export function normalizeTransaction(input) {
  return {
    userId: mongoose.Types.ObjectId.isValid(input.userId)
      ? input.userId
      : new mongoose.Types.ObjectId("000000000000000000000001"),

    type: input.type || "deposit",
    source: input.source || "MARI_BANK",
    amount: Number(input.amount),
    currency: input.currency || "FLOWER",
    referenceId: input.referenceId,
    timestamp: input.timestamp || new Date(),
    raw: input,
  };
}
