/**
 * diagnose-deposit-history.js
 *
 * READ-ONLY. Companion to diagnose-maya-match.js.
 *
 *   1. Shows ALL DirectDeposit records for a user (any status) so we can see
 *      what actually happened to a deposit that's no longer "PENDING"
 *      (CREDITED, EXPIRED, etc.) and when.
 *   2. Shows a count of DepositReview ("Flagged") entries, since that's the
 *      queue everything falls into when processTransaction() can't match.
 *
 * Usage:
 *   node diagnose-deposit-history.js <userEmail>
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./src/models/userModel.js";
import DirectDeposit from "./src/models/DirectDepositModel.js";
import DepositReview from "./src/models/depositReviewModel.js";

dotenv.config();

const email = process.argv[2];
if (!email) {
  console.error("Usage: node diagnose-deposit-history.js <userEmail>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);

const user = await User.findOne({ email }).lean();
if (!user) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}
console.log(`\nUser: ${user.firstName || ""} ${user.lastName || ""} (${user._id})`);

// ── 1. Full deposit history for this user ───────────────────────────────────
console.log("\n=== ALL DirectDeposits for this user (most recent first) ===");
const deposits = await DirectDeposit.find({ userId: user._id })
  .sort({ createdAt: -1 })
  .limit(20)
  .lean();

if (deposits.length === 0) {
  console.log("  (no deposits found)");
} else {
  for (const d of deposits) {
    console.log(
      `  ref=${d.referenceId}  channel=${d.channel}  amount=${d.amount}  status=${d.status}  ` +
      `created=${d.createdAt.toISOString()}  expires=${d.expiresAt?.toISOString() || "n/a"}` +
      `${d.creditedAt ? `  credited=${d.creditedAt.toISOString()}` : ""}`
    );
  }
}

// ── 2. Flagged / DepositReview queue ─────────────────────────────────────────
console.log("\n=== DepositReview ('Flagged') queue — all users, recent first ===");
const reviews = await DepositReview.find().sort({ createdAt: -1 }).limit(20).lean();
const totalPending = await DepositReview.countDocuments({ status: "pending_review" });
console.log(`Total pending_review count: ${totalPending}\n`);

for (const r of reviews) {
  console.log(
    `  [${r.createdAt.toISOString()}] chain=${r.chain} amount=${r.amount} status=${r.status} ` +
    `userId=${r.userId || "null"} txHash=${r.txHash}`
  );
}

console.log("\nNote: DepositReview does not currently store *why* something was");
console.log("flagged (NO_MATCHING_USER vs AMBIGUOUS_DEPOSIT vs INVALID_AMOUNT etc.)");
console.log("— that reason is only emitted to the event stream and lost otherwise.");
console.log("This is itself a gap worth fixing if we want the Flagged tab to be");
console.log("actionable instead of just a pile of unexplained entries.");

process.exit(0);
