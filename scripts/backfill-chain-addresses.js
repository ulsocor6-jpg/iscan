import mongoose from "mongoose";
import dotenv from "dotenv";
import Wallet from "../src/models/walletModel.js";
import { deriveUserWallets, SUPPORTED_CHAINS } from "../src/services/hdWalletService.js";

dotenv.config();

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);
  console.log("[BACKFILL] MongoDB connected");

  const wallets = await Wallet.find({
    $or: [
      { chainAddresses: { $exists: false } },
      { chainAddresses: { $size: 0 } },
    ],
  });

  console.log(`[BACKFILL] Found ${wallets.length} wallets to backfill`);

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    try {
      const derived = await deriveUserWallets(i);
      const chainAddresses = Object.entries(derived).map(([chain, data]) => ({
        chain,
        address: data.address,
        chainId: SUPPORTED_CHAINS[chain]?.chainId || "0x1",
        usdtBalance: 0,
        usdcBalance: 0,
      }));
      wallet.chainAddresses = chainAddresses;
      await wallet.save();
      console.log(`[BACKFILL] ✅ userId=${wallet.userId}`);
      for (const ca of chainAddresses) {
        console.log(`           ${ca.chain}: ${ca.address}`);
      }
    } catch (err) {
      console.error(`[BACKFILL] ❌ userId=${wallet.userId}:`, err.message);
    }
  }

  console.log("[BACKFILL] Done.");
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error("[BACKFILL FATAL]", err);
  process.exit(1);
});
