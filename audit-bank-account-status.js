/**
 * audit-bank-account-status.js
 *
 * READ-ONLY. Run this first to see how many BankAccount records are stuck
 * at status "pending" (the bug that blocks Maya/MariBank auto-credit matching
 * in src/core/processTransaction.js, which requires status: "active").
 *
 * Usage:
 *   node audit-bank-account-status.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import BankAccount from "./src/models/BankAccount.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);

const total = await BankAccount.countDocuments();
const byStatus = await BankAccount.aggregate([
  { $group: { _id: { provider: "$provider", status: "$status" }, count: { $sum: 1 } } },
  { $sort: { "_id.provider": 1, "_id.status": 1 } },
]);

console.log(`\nTotal BankAccount records: ${total}\n`);
console.log("By provider + status:");
for (const row of byStatus) {
  console.log(`  ${row._id.provider.padEnd(6)} | ${row._id.status.padEnd(9)} | ${row.count}`);
}

const pendingMaya = await BankAccount.find({ provider: "maya", status: "pending" })
  .select("accountName accountNumber userId createdAt")
  .lean();

console.log(`\nPending Maya accounts (these can NEVER auto-match today): ${pendingMaya.length}`);
for (const acc of pendingMaya) {
  console.log(`  userId=${acc.userId}  ${acc.accountName}  ${acc.accountNumber}  linked ${acc.createdAt.toISOString()}`);
}

process.exit(0);
