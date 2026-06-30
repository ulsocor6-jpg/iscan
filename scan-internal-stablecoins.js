import 'dotenv/config';
import mongoose from 'mongoose';
import { ethers } from 'ethers';

import Wallet from './src/models/walletModel.js';
import User from './src/models/userModel.js';

await mongoose.connect(process.env.MONGODB_URI);

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC);

const ERC20 = [
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)"
];

const usdc = new ethers.Contract(
  process.env.BASE_USDC_TOKEN,
  ERC20,
  provider
);

const usdt = new ethers.Contract(
  process.env.BASE_USDT_TOKEN,
  ERC20,
  provider
);

const usdcDecimals = await usdc.decimals();
const usdtDecimals = await usdt.decimals();

let totalUSDC = 0;
let totalUSDT = 0;

const wallets = await Wallet.find().lean();

console.log("==========================================");
console.log("ISCAN INTERNAL WALLET STABLECOIN SCAN");
console.log("==========================================\n");

for (const wallet of wallets) {

  const base = wallet.chainAddresses?.find(
    c => c.chain?.toUpperCase() === "BASE"
  );

  if (!base?.address) continue;

  const [usdcBal, usdtBal, user] = await Promise.all([
    usdc.balanceOf(base.address),
    usdt.balanceOf(base.address),
    User.findById(wallet.userId).select("email")
  ]);

  const usdcValue = Number(
    ethers.formatUnits(usdcBal, usdcDecimals)
  );

  const usdtValue = Number(
    ethers.formatUnits(usdtBal, usdtDecimals)
  );

  if (usdcValue === 0 && usdtValue === 0)
    continue;

  totalUSDC += usdcValue;
  totalUSDT += usdtValue;

  console.log("------------------------------------------");
  console.log("Email :", user?.email);
  console.log("Wallet:", base.address);
  console.log("USDC  :", usdcValue);
  console.log("USDT  :", usdtValue);
}

console.log("\n==========================================");
console.log("TOTAL STRANDED");
console.log("USDC :", totalUSDC);
console.log("USDT :", totalUSDT);
console.log("==========================================");

await mongoose.disconnect();
