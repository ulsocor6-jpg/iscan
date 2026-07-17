// One-off diagnostic: lists every incoming USDC Transfer event to a given
// Base address, and flags which ones have no matching Deposit/Ledger row.
// Usage: node scripts/trace-usdc-transfers.js <address>

import "dotenv/config";
import mongoose from "mongoose";
import { ethers } from "ethers";
import Deposit from "../src/models/depositModel.js";
import Ledger from "../src/models/ledgerModel.js";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URL;
const address = process.argv[2];

if (!address) {
  console.error("Usage: node scripts/trace-usdc-transfers.js <address>");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("[OK] connected to Mongo\n");

const BASE_RPC = process.env.BASE_BALANCE_RPC || process.env.BASE_RPC || "https://base.llamarpc.com";
const USDC_TOKEN = process.env.BASE_USDC_TOKEN || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const provider = new ethers.JsonRpcProvider(BASE_RPC);
const iface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

const topicTransfer = ethers.id("Transfer(address,address,uint256)");
const topicTo = ethers.zeroPadValue(address, 32);

const latest = await provider.getBlockNumber();
console.log(`Latest block: ${latest}. Scanning last 500,000 blocks for incoming USDC transfers...\n`);

const CHUNK = 5000; // conservative for free-tier RPC
let logs = [];
let from = Math.max(0, latest - 500000);

while (from <= latest) {
  const to = Math.min(from + CHUNK - 1, latest);
  try {
    const chunkLogs = await provider.getLogs({
      address: USDC_TOKEN,
      topics: [topicTransfer, null, topicTo],
      fromBlock: from,
      toBlock: to,
    });
    logs = logs.concat(chunkLogs);
  } catch (err) {
    console.error(`  [WARN] block ${from}-${to} failed: ${err.message}`);
  }
  from = to + 1;
}

console.log(`Found ${logs.length} incoming USDC transfer(s) on-chain.\n`);

for (const log of logs) {
  const parsed = iface.parseLog(log);
  const value = ethers.formatUnits(parsed.args.value, 6); // USDC = 6 decimals
  const txHash = log.transactionHash;

  const deposit = await Deposit.findOne({ txHash });
  const ledgerEntry = await Ledger.findOne({ referenceId: txHash });

  console.log(`tx: ${txHash}`);
  console.log(`  from: ${parsed.args.from}`);
  console.log(`  amount: ${value} USDC`);
  console.log(`  block: ${log.blockNumber}`);
  console.log(`  Deposit record: ${deposit ? "FOUND (" + deposit.status + ")" : "MISSING"}`);
  console.log(`  Ledger record:  ${ledgerEntry ? "FOUND" : "MISSING"}`);
  console.log("");
}

await mongoose.disconnect();
process.exit(0);
