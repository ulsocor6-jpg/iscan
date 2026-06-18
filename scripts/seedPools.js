import "dotenv/config";
import mongoose from "mongoose";
import PhpLiquidityPool from "../src/models/phpLiquidityPool.js";

const POOLS = [
  { currency: "PHP",  balance: 100000, minThreshold: 10000 },
  { currency: "USDT", balance: 2000,   minThreshold: 50    },
  { currency: "USDC", balance: 2000,   minThreshold: 50    },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");
  for (const p of POOLS) {
    const existing = await PhpLiquidityPool.findOne({ currency: p.currency });
    if (existing) {
      console.log(`[SKIP] ${p.currency} pool already exists — balance: ${existing.balance}`);
    } else {
      await PhpLiquidityPool.create(p);
      console.log(`[CREATED] ${p.currency} pool — balance: ${p.balance}`);
    }
  }
  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch(err => { console.error(err); process.exit(1); });
