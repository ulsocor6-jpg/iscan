import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import Wallet from "./src/models/walletModel.js";

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);
const wallets = await Wallet.find({}).lean();
fs.writeFileSync(
  `./wallets-backup-${Date.now()}.json`,
  JSON.stringify(wallets, null, 2)
);
console.log(`Backed up ${wallets.length} wallets`);
await mongoose.disconnect();
