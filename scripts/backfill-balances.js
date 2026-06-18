import mongoose from "mongoose";
import Wallet from "../src/models/walletModel.js";

await mongoose.connect(process.env.MONGODB_URI);

const wallets = await Wallet.find();

for (const wallet of wallets) {
  if (!wallet.balances.has("FLOWER")) {
    wallet.balances.set("FLOWER", 0);
  }

  if (!wallet.balances.has("RON")) {
    wallet.balances.set("RON", 0);
  }

  wallet.markModified("balances");
  await wallet.save();
}

console.log(`Updated ${wallets.length} wallets`);
process.exit(0);
