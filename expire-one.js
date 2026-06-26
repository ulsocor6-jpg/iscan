import mongoose from "mongoose";
import dotenv from "dotenv";
import DirectDeposit from "./src/models/DirectDepositModel.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

await DirectDeposit.updateOne(
  { referenceId: "ISCAN-F0FEA2" },
  {
    $set: {
      expiresAt: new Date("2025-01-01")
    }
  }
);

console.log("Updated");

process.exit(0);
