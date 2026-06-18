import mongoose from "mongoose";
import dotenv from "dotenv";
import Wallet from "../src/models/walletModel.js";
import { deriveUserWallets, SUPPORTED_CHAINS } from "../src/services/hdWalletService.js";

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);

const wallets = await Wallet.find({});
console.log(`Found ${wallets.length} wallets`);

for (const wallet of wallets) {
  if (wallet.walletIndex === undefined || wallet.walletIndex === null) {
    console.error(`Skipping userId=${wallet.userId} — no walletIndex. Run assign-wallet-index.js first.`);
    continue;
  }
  const derived = await deriveUserWallets(wallet.walletIndex);
  wallet.chainAddresses = Object.entries(derived).map(([chain, data]) => ({
    chain,
    address: data.address,
    chainId: SUPPORTED_CHAINS[chain].chainId,
    usdtBalance: 0,
    usdcBalance: 0
  }));
  await wallet.save();
  console.log(`Updated ${wallet.iscanAddress} (walletIndex=${wallet.walletIndex})`);
}

await mongoose.disconnect();
console.log("Done");
