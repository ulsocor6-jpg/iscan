import mongoose from "mongoose";
import dotenv from "dotenv";
import DirectDeposit from "./src/models/DirectDepositModel.js";

dotenv.config();

await mongoose.connect(
 process.env.MONGODB_URI || process.env.MONGO_URL
);

const docs = await DirectDeposit.find({})
.sort({ createdAt: -1 })
.lean();

console.log(JSON.stringify(docs,null,2));

process.exit(0);
