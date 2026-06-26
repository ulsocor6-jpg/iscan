import mongoose from "mongoose";
import dotenv from "dotenv";
import DirectDeposit from "./src/models/DirectDepositModel.js";
import DepositLog from "./src/models/DepositLog.js";

dotenv.config();

await mongoose.connect(
 process.env.MONGODB_URI || process.env.MONGO_URL
);

console.log(
 await DirectDeposit.collection.indexes()
);

console.log(
 await DepositLog.collection.indexes()
);

process.exit(0);
