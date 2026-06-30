/**
 * diagnose-maya-match.js
 *
 * READ-ONLY. Checks the three things that can block Maya auto-credit
 * matching for a given user, side by side:
 *
 *   1. Their linked Maya BankAccount record (provider, accountNumber, status)
 *   2. Recent IngressEvent docs with source "MAYA" (did the watcher even
 *      receive anything, and what senderPhone/senderName did it extract?)
 *   3. Their current PENDING DirectDeposit records (channel, amount, expiresAt)
 *
 * Usage:
 *   node diagnose-maya-match.js <userEmail>
 *
 * Example:
 *   node diagnose-maya-match.js uls.ocor.7@gmail.com
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./src/models/userModel.js";
import BankAccount from "./src/models/BankAccount.js";
import DirectDeposit from "./src/models/DirectDepositModel.js";
import IngressEvent from "./src/models/IngressEvent.js";

dotenv.config();

const email = process.argv[2];
if (!email) {
  console.error("Usage: node diagnose-maya-match.js <userEmail>");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);

const user = await User.findOne({ email }).lean();
if (!user) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}
console.log(`\nUser: ${user.firstName || ""} ${user.lastName || ""} (${user._id})`);

// ── 1. Their linked Maya account(s) ─────────────────────────────────────────
console.log("\n=== Linked Maya BankAccount(s) ===");
const mayaAccounts = await BankAccount.find({ userId: user._id, provider: "maya" }).lean();
if (mayaAccounts.length === 0) {
  console.log("  ⚠️  No Maya account linked at all for this user.");
} else {
  for (const acc of mayaAccounts) {
    console.log(`  accountNumber="${acc.accountNumber}"  status=${acc.status}  accountName="${acc.accountName}"`);
  }
}

// ── 2. Recent MAYA ingress events (raw watcher data) ────────────────────────
console.log("\n=== Last 10 MAYA IngressEvents (any user) ===");
const events = await IngressEvent.find({ source: "MAYA" }).sort({ receivedAt: -1 }).limit(10).lean();
if (events.length === 0) {
  console.log("  ⚠️  No MAYA ingress events found at all — the watcher/forwarder");
  console.log("      app on the phone is not reaching POST /api/v1/maya/notify.");
} else {
  for (const e of events) {
    console.log(`  [${e.receivedAt.toISOString()}] status=${e.status} amount=${e.metadata?.amount} senderPhone=${e.metadata?.senderPhone} senderName=${e.metadata?.senderName} senderLastFour=${e.metadata?.senderLastFour}${e.failureReason ? `  ERROR=${e.failureReason}` : ""}`);
  }
}

// ── 3. Their current pending deposits ───────────────────────────────────────
console.log("\n=== Their PENDING DirectDeposits ===");
const pending = await DirectDeposit.find({ userId: user._id, status: "PENDING" }).lean();
if (pending.length === 0) {
  console.log("  (none pending right now)");
} else {
  const now = new Date();
  for (const d of pending) {
    const expired = d.expiresAt < now;
    console.log(`  ref=${d.referenceId} channel=${d.channel} amount=${d.amount} expiresAt=${d.expiresAt.toISOString()} ${expired ? "❌ ALREADY EXPIRED" : "✅ still valid"}`);
  }
}

console.log("\n=== How to read this ===");
console.log("For a deposit to auto-credit, the senderPhone/senderName from an");
console.log("IngressEvent above must exactly match a BankAccount in section 1");
console.log("(after phone normalization: 09XXXXXXXXX), AND there must be a");
console.log("PENDING deposit in section 3 with the same amount, not expired,");
console.log("at the moment the notification arrives.");

process.exit(0);
