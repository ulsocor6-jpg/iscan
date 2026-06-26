import mongoose from "mongoose";
import dotenv from "dotenv";
import DirectDeposit from "./src/models/DirectDepositModel.js";
import DepositLog from "./src/models/DepositLog.js";

dotenv.config();

await mongoose.connect(
 process.env.MONGODB_URI || process.env.MONGO_URL
);

console.log(
 "PENDING:",
 await DirectDeposit.countDocuments()
);

console.log(
 "LOGS:",
 await DepositLog.countDocuments()
);

process.exit(0);
