import "dotenv/config";
import mongoose from "mongoose";
import walletService from "../src/services/walletService.js";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL;
await mongoose.connect(MONGO_URI);

const userId = "6a33109cb3154a5aae5e85f4";

try {
  const result = await walletService.credit(userId, "USDC", 0.911423, {
    referenceId: `test-correction-${Date.now()}`,
    description: "Test balance correction",
    transactionType: "balance_correction",
  });
  console.log("SUCCESS:", JSON.stringify(result, null, 2));
} catch (err) {
  console.error("FAILED:", err.message);
  console.error(err.stack);
}

await mongoose.disconnect();
process.exit(0);
