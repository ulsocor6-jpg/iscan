import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

import processTransaction from "./src/core/processTransaction.js";

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const result = await processTransaction({
  source: "MARI_BANK",
  amount: 20,
  senderName: "RAUL ROCO",
  senderLastFour: "7726"
});

console.log(result);

process.exit(0);
