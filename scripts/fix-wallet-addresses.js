import mongoose from "mongoose";
import dotenv from "dotenv";
import Wallet from "../src/models/walletModel.js";
import {
  deriveUserWallets,
  SUPPORTED_CHAINS
} from "../src/services/hdWalletService.js";

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const wallets = await Wallet.find({});

console.log(`Found ${wallets.length} wallets`);

for (let i = 0; i < wallets.length; i++) {
  const wallet = wallets[i];

  const derived = await deriveUserWallets(i);

  wallet.chainAddresses = Object.entries(derived).map(
    ([chain, data]) => ({
      chain,
      address: data.address,
      chainId: SUPPORTED_CHAINS[chain].chainId,
      usdtBalance: 0,
      usdcBalance: 0
    })
  );

  await wallet.save();

  console.log(
    `Updated ${wallet.iscanAddress}`
  );
}

await mongoose.disconnect();
console.log("Done");
