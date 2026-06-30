import 'dotenv/config';
import mongoose from 'mongoose';
import { ethers } from 'ethers';

import DepositAddress from './src/models/depositAddressModel.js';
import User from './src/models/userModel.js';

await mongoose.connect(process.env.MONGODB_URI);

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC);

const token = new ethers.Contract(
  process.env.BASE_USDC_TOKEN,
  [
    "function balanceOf(address) view returns(uint256)",
    "function decimals() view returns(uint8)"
  ],
  provider
);

const decimals = await token.decimals();

const wallets = await DepositAddress.find({
  chain: "base",
  token: "USDC",
  status: "active"
});

for (const w of wallets) {
  const bal = await token.balanceOf(w.address);

  if (bal > 0n) {
    const user = await User.findById(w.userId);

    console.log("--------------------------------");
    console.log("EMAIL   :", user?.email);
    console.log("ADDRESS :", w.address);
    console.log("HDINDEX :", w.hdIndex);
    console.log("USDC    :", ethers.formatUnits(bal, decimals));
  }
}

await mongoose.disconnect();
