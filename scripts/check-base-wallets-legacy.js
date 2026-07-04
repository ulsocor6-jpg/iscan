import dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { deriveBaseAddress } from "../src/services/hdWalletService.js";

const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);

const usdc = new ethers.Contract(
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ],
  provider
);

const wallets = [
  {
    index: 1,
    expected: "0x3c1533407275539cc07508b27999e2ed0afc7114"
  },
  {
    index: 2,
    expected: "0xf17d48cd064ce792a07585140c0b7c24446f4cc1"
  },
  {
    index: 3,
    expected: "0x747497cbfb31d104d547c913a64ef64cfd7c78b7"
  }
];

const decimals = await usdc.decimals();

for (const w of wallets) {
  const derived = await deriveBaseAddress(w.index);

  const eth = await provider.getBalance(w.expected);
  const usdcBal = await usdc.balanceOf(w.expected);

  console.log("==================================");
  console.log("Wallet Index :", w.index);
  console.log("Expected     :", w.expected);
  console.log("Derived      :", derived.address);
  console.log("Match        :", derived.address.toLowerCase() === w.expected.toLowerCase());
  console.log("Base ETH     :", ethers.formatEther(eth));
  console.log("USDC         :", ethers.formatUnits(usdcBal, decimals));
}
