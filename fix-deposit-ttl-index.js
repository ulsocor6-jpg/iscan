/**
 * fix-deposit-ttl-index.js
 *
 * ONE-TIME FIX. The DirectDeposit collection currently has a TTL index on
 * expiresAt with { expireAfterSeconds: 0 }, which makes MongoDB itself
 * hard-delete PENDING deposits the instant they expire — bypassing
 * depositExpiryWorker.js entirely and silently destroying records that
 * real incoming Maya/MariBank transactions needed to match against.
 *
 * This script drops that old index. Mongoose will recreate the (safe,
 * non-TTL) index defined in src/models/DirectDepositModel.js automatically
 * the next time the server starts and connects.
 *
 * Usage:
 *   node fix-deposit-ttl-index.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);

const collection = mongoose.connection.collection("directdeposits");

console.log("\nCurrent indexes on directdeposits:");
const indexes = await collection.indexes();
for (const idx of indexes) {
  console.log(" ", JSON.stringify(idx));
}

const ttlIndex = indexes.find(
  (idx) => idx.key && idx.key.expiresAt === 1 && idx.expireAfterSeconds !== undefined
);

if (!ttlIndex) {
  console.log("\nNo TTL index found on expiresAt — nothing to drop. You're already clean.");
  process.exit(0);
}

console.log(`\nDropping TTL index "${ttlIndex.name}" (expireAfterSeconds: ${ttlIndex.expireAfterSeconds})...`);
await collection.dropIndex(ttlIndex.name);
console.log("✅ Dropped. Restart your server — Mongoose will recreate a normal");
console.log("   (non-expiring) index on expiresAt automatically.");

process.exit(0);
