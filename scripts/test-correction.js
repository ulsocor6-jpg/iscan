import "dotenv/config";
import mongoose from "mongoose";
import { reconcileUser, correctUserDrift } from "../src/services/reconciliationService.js";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL;
await mongoose.connect(MONGO_URI);

const userId = "6a33109cb3154a5aae5e85f4";

console.log("=== BEFORE ===");
console.log(JSON.stringify(await reconcileUser(userId), null, 2));

console.log("\n=== RUNNING CORRECTION ===");
const result = await correctUserDrift(userId);
console.log(JSON.stringify(result, null, 2));

console.log("\n=== AFTER ===");
console.log(JSON.stringify(await reconcileUser(userId), null, 2));

await mongoose.disconnect();
process.exit(0);
