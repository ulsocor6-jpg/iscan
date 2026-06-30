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

const wallets = await Wallet.find().lean();

let totalUSDC = 0;
let totalUSDT = 0;

console.log("\n==============================================================");
console.log("ISCAN INTERNAL WALLET AUDIT");
console.log("==============================================================");

for (const wallet of wallets) {

  const base = wallet.chainAddresses?.find(
    c => c.chain === "BASE"
  );

  if (!base) continue;

  const [user, usdcBalRaw, usdtBalRaw] = await Promise.all([
    User.findById(wallet.userId).select("email"),
    usdc.balanceOf(base.address),
    usdt.balanceOf(base.address)
  ]);

  const usdcBal = Number(
    ethers.formatUnits(usdcBalRaw, usdcDecimals)
  );

  const usdtBal = Number(
    ethers.formatUnits(usdtBalRaw, usdtDecimals)
  );

  totalUSDC += usdcBal;
  totalUSDT += usdtBal;

  if (usdcBal > 0 || usdtBal > 0) {
    console.log("----------------------------------------");
    console.log("Email      :", user?.email);
    console.log("Wallet     :", wallet.walletIndex);
    console.log("Address    :", base.address);
    console.log("Ledger USDC:", wallet.balances?.USDC || 0);
    console.log("Ledger USDT:", wallet.balances?.USDT || 0);
    console.log("Chain USDC :", usdcBal);
    console.log("Chain USDT :", usdtBal);
  }
}

console.log("==============================================================");
console.log("TOTAL CHAIN USDC:", totalUSDC);
console.log("TOTAL CHAIN USDT:", totalUSDT);
console.log("==============================================================");

await mongoose.disconnect();
