import mongoose from "mongoose";
import dotenv from "dotenv";
import DepositLog from "./src/models/DepositLog.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const logs = await DepositLog.find({}).lean();

console.log(JSON.stringify(logs, null, 2));

process.exit(0);
