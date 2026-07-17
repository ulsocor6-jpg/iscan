import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Wallet from "./src/models/walletModel.js";
import { deriveBaseAddress } from "./src/services/hdWalletService.js";

await mongoose.connect(process.env.MONGO_URI);

const wallet = await Wallet.findOne({
  "chainAddresses.chain": "BASE"
});

if (!wallet) {
  console.log("No wallet found");
  process.exit(1);
}

const stored = wallet.chainAddresses.find(c => c.chain === "BASE");
const derived = await deriveBaseAddress(wallet.walletIndex);

console.log({
  userId: wallet.userId,
  walletIndex: wallet.walletIndex,
  storedAddress: stored.address.toLowerCase(),
  derivedAddress: derived.address.toLowerCase(),
  match: stored.address.toLowerCase() === derived.address.toLowerCase()
});

await mongoose.disconnect();
