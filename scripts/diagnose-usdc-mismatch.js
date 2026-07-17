// scripts/diagnose-usdc-mismatch.js
//
// Compares two independent sources of "USDC balance" for every user that
// has USDC ledger activity:
//   1. Ledger aggregate (credit - debit) -- what walletService.debit()
//      actually checks against on submit (the "Insufficient USDC balance"
//      error source).
//   2. Real on-chain RPC balance per chain (Base, Ronin) -- what
//      onchainBalanceService.getTokenBalance() reads live, and what
//      /api/v1/wallet/balances likely surfaces as the flat "Available USDC"
//      shown in the Swaps.tsx UI.
//
// If these disagree, the Ledger has drifted from on-chain reality (or
// vice versa) -- this script just measures the gap, it doesn't fix it.
//
// Usage:
//   node scripts/diagnose-usdc-mismatch.js
//
// Requires your Mongo connection string in .env. Adjust MONGO_ENV_KEYS
// below if your project uses a different variable name than the common
// ones checked here.

import "dotenv/config";
import mongoose from "mongoose";
import Ledger from "../src/models/ledgerModel.js";
import Wallet from "../src/models/walletModel.js";
import { getTokenBalance } from "../src/services/onchainBalanceService.js";

const MONGO_ENV_KEYS = ["MONGODB_URI", "MONGO_URI", "DATABASE_URL", "MONGO_URL"];
const MONGO_URI = MONGO_ENV_KEYS.map((k) => process.env[k]).find(Boolean);

if (!MONGO_URI) {
  console.error(
    `[FAIL] No Mongo connection string found in .env under any of: ${MONGO_ENV_KEYS.join(", ")}\n` +
    `Run 'grep -i mongo .env' to find your actual variable name, then edit MONGO_ENV_KEYS above.`
  );
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("[OK] connected to Mongo\n");

const usdcLedgerRows = await Ledger.aggregate([
  { $match: { currency: "USDC" } },
  {
    $group: {
      _id: "$userId",
      credit: { $sum: { $ifNull: ["$credit", 0] } },
      debit: { $sum: { $ifNull: ["$debit", 0] } },
    },
  },
]);

if (usdcLedgerRows.length === 0) {
  console.log("No USDC ledger activity found for any user.");
  await mongoose.disconnect();
  process.exit(0);
}

console.log("=== USDC balance comparison: Ledger vs real on-chain ===\n");

for (const row of usdcLedgerRows) {
  const ledgerBal = row.credit - row.debit;
  const wallet = await Wallet.findOne({ userId: row._id });
  const addresses = wallet?.chainAddresses || [];

  const onchain = {};
  for (const ca of addresses) {
    const chain = ca.chain?.toUpperCase();
    if (!["BASE", "RONIN"].includes(chain)) continue;
    try {
      onchain[chain] = await getTokenBalance(chain, ca.address, "USDC");
    } catch (err) {
      onchain[chain] = `ERR: ${err.message}`;
    }
  }

  const onchainSum =
    (typeof onchain.BASE === "number" ? onchain.BASE : 0) +
    (typeof onchain.RONIN === "number" ? onchain.RONIN : 0);

  console.log(`userId: ${row._id}`);
  console.log(`  Ledger:      credit=${row.credit}  debit=${row.debit}  => balance=${ledgerBal}`);
  console.log(`  On-chain:    BASE=${onchain.BASE ?? "n/a"}  RONIN=${onchain.RONIN ?? "n/a"}  => sum=${onchainSum}`);
  console.log(`  Difference:  ${(onchainSum - ledgerBal).toFixed(6)} (on-chain minus ledger)`);
  console.log("");
}

await mongoose.disconnect();
process.exit(0);
