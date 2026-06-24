import mongoose from "mongoose";
import FlowerLiquidityPool from "../models/flowerLiquidityPool.js";

await mongoose.connect(process.env.MONGO_URI);

await FlowerLiquidityPool.updateOne(
  { currency: "FLOWER" },
  {
    $set: {
      balance: 1000000,
      reserved: 0
    }
  },
  { upsert: true }
);

await FlowerLiquidityPool.updateOne(
  { currency: "USDT" },
  {
    $set: {
      balance: 50000,
      reserved: 0
    }
  },
  { upsert: true }
);

console.log("FLOWER liquidity created");

process.exit(0);
