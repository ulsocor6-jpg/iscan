import mongoose from "mongoose";
import dotenv from "dotenv";
import Wallet from "../src/models/walletModel.js";

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);

const wallets = await Wallet.find({ walletIndex: { $exists: false } }).sort({ createdAt: 1 });
console.log(`Assigning walletIndex to ${wallets.length} wallets, ordered by createdAt`);

for (let i = 0; i < wallets.length; i++) {
  wallets[i].walletIndex = i;
  await wallets[i].save();
  console.log(`userId=${wallets[i].userId} -> walletIndex=${i}`);
}

console.log("Done.");
await mongoose.disconnect();
