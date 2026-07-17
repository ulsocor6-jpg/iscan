// scripts/trace-user-usdc-history.js
//
// Full trail for one user's USDC: every Ledger entry (with timestamps and
// referenceId/description so we can see WHAT each credit/debit was for),
// plus any FlowerOrder or CryptoDeposit-style records tied to their
// on-chain address, so we can see whether a real on-chain USDC deposit
// ever happened without a matching ledger credit.
//
// Usage:
//   node scripts/trace-user-usdc-history.js <userId>
//
// Example:
//   node scripts/trace-user-usdc-history.js 6a33109cb3154a5aae5e85f4

import "dotenv/config";
import mongoose from "mongoose";
import Ledger from "../src/models/ledgerModel.js";
import Wallet from "../src/models/walletModel.js";
import FlowerOrder from "../src/models/flower/flowerOrderModel.js";

const MONGO_ENV_KEYS = ["MONGODB_URI", "MONGO_URI", "DATABASE_URL", "MONGO_URL"];
const MONGO_URI = MONGO_ENV_KEYS.map((k) => process.env[k]).find(Boolean);

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: node scripts/trace-user-usdc-history.js <userId>");
  process.exit(1);
}

if (!MONGO_URI) {
  console.error(`[FAIL] No Mongo connection string found in .env (checked ${MONGO_ENV_KEYS.join(", ")})`);
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log(`[OK] connected — tracing USDC history for userId=${userId}\n`);

const objId = new mongoose.Types.ObjectId(userId);

// 1. Wallet + on-chain addresses
const wallet = await Wallet.findOne({ userId: objId }).lean();
console.log("=== Wallet addresses ===");
if (!wallet) {
  console.log("  No wallet found for this userId.");
} else {
  (wallet.chainAddresses || []).forEach((ca) => {
    console.log(`  ${ca.chain}: ${ca.address}  (walletIndex=${wallet.walletIndex ?? "n/a"})`);
  });
}

// 2. Full USDC ledger trail, chronological
console.log("\n=== USDC Ledger entries (chronological) ===");
const entries = await Ledger.find({ userId: objId, currency: "USDC" })
  .sort({ createdAt: 1 })
  .lean();

if (entries.length === 0) {
  console.log("  No USDC ledger entries at all.");
} else {
  let running = 0;
  for (const e of entries) {
    const credit = e.credit || 0;
    const debit = e.debit || 0;
    running += credit - debit;
    console.log(
      `  ${e.createdAt?.toISOString() || "no-date"}  ` +
      `credit=${credit}  debit=${debit}  running=${running.toFixed(6)}  ` +
      `ref=${e.referenceId || "-"}  type=${e.type || e.transactionType || "-"}  ` +
      `desc="${e.description || ""}"`
    );
  }
}

// 3. FlowerOrders for this user (any status, any chain) — to see if a
// FLOWER->USDC settlement ever ran that should have credited this address
console.log("\n=== FlowerOrders for this user ===");
const orders = await FlowerOrder.find({ userId: objId }).sort({ createdAt: 1 }).lean();
if (orders.length === 0) {
  console.log("  No FlowerOrder records for this user.");
} else {
  orders.forEach((o) => {
    console.log(
      `  ${o.createdAt?.toISOString() || "no-date"}  orderId=${o.orderId}  ` +
      `status=${o.status}  chain=${o.chain}  direction=${o.direction || "FLOWER_TO_USDC"}  ` +
      `receivedAmount=${o.receivedAmount ?? "-"}  usdcReceived=${o.usdcReceived ?? "-"}  ` +
      `usdcAmountIn=${o.usdcAmountIn ?? "-"}  depositAddress=${o.depositAddress || "-"}  ` +
      `failureReason=${o.failureReason || "-"}`
    );
  });
}

await mongoose.disconnect();
process.exit(0);
