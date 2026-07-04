import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { ethers } from "ethers";

import Wallet from "../src/models/walletModel.js";
import { deriveBaseAddress } from "../src/services/hdWalletService.js";

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC || "https://mainnet.base.org");

const USDC = new ethers.Contract(
  process.env.BASE_USDC_TOKEN || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ],
  provider
);

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL);

const walletIds = [
  "6a2b546bad9ae11f2f193a7f",
  "6a2b5c07d0e930e95f86f289",
  "6a2b5d30455845ef23fe825f"
];

const decimals = await USDC.decimals();

for (const userId of walletIds) {
  const wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    console.log(`\n❌ Wallet not found: ${userId}`);
    continue;
  }

  const stored = wallet.chainAddresses.find(c => c.chain === "BASE");

  if (!stored) {
    console.log(`\n❌ No BASE address for ${userId}`);
    continue;
  }

  const derived = await deriveBaseAddress(wallet.walletIndex);

  const eth = await provider.getBalance(stored.address);
  const usdc = await USDC.balanceOf(stored.address);

  console.log("\n====================================================");
  console.log("User ID      :", userId);
  console.log("Wallet Index :", wallet.walletIndex);
  console.log("Stored Addr  :", stored.address);
  console.log("Derived Addr :", derived.address);
  console.log("MATCH        :", stored.address.toLowerCase() === derived.address.toLowerCase() ? "YES ✅" : "NO ❌");
  console.log("Has PK       :", derived.privateKey ? "YES ✅" : "NO ❌");
  console.log("ETH Balance  :", ethers.formatEther(eth));
  console.log("USDC Balance :", ethers.formatUnits(usdc, decimals));
}

await mongoose.disconnect();
