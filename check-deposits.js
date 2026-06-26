import mongoose from "mongoose";
import dotenv from "dotenv";
import DirectDeposit from "./src/models/DirectDepositModel.js";

dotenv.config();

await mongoose.connect(
  process.env.MONGODB_URI || process.env.MONGO_URL
);

const deposits = await DirectDeposit.find({}).lean();

console.log(JSON.stringify(deposits, null, 2));

process.exit(0);
