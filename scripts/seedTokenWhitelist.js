import mongoose from "mongoose";
import TokenWhitelist from "../src/models/compliance/TokenWhitelist.js";
import "dotenv/config";

const TOKENS = [
  { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chain: "base" },
  { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", chain: "base" },
  { symbol: "FLOWER", address: process.env.BASE_FLOWER_TOKEN || "0x...", chain: "base" }, // update address
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);
  for (const t of TOKENS) {
    await TokenWhitelist.updateOne(
      { symbol: t.symbol },
      { $setOnInsert: t },
      { upsert: true }
    );
  }
  console.log("TokenWhitelist seeded");
  process.exit(0);
}
seed();
