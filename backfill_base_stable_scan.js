#!/usr/bin/env node
// One-off backfill: scans a much wider block range than
// baseStableListener.js's normal 150-block window, so it can catch a
// USDC/USDT deposit that already happened before the wildcard-token fix
// was live. Reuses the exact same createDetectedDeposit() -> sweep path
// the real listener uses, so crediting/dedup behaves identically — this
// is not a shortcut around the normal pipeline, just a wider window.
//
// Run once from ~/Desktop/iscansystem:
//   node backfill_base_stable_scan.js
//   node backfill_base_stable_scan.js --blocks 50000   # override lookback
//
// Delete this file after you've confirmed the deposit was picked up.

import "dotenv/config";
import mongoose from "mongoose";
import { ethers } from "ethers";
import DepositAddress from "./src/models/depositAddressModel.js";
import { createDetectedDeposit } from "./src/services/cryptoDepositPipeline.js";
import { deriveBaseAddress } from "./src/services/hdWalletService.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const TRANSFER_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

const TOKEN_DECIMALS = { USDC: 6, USDT: 6 };

const BASE_RPC        = process.env.BASE_RPC || "https://mainnet.base.org";
const TREASURY_WALLET = process.env.BASE_TREASURY_WALLET;
const TOKENS = {
  USDC: process.env.BASE_USDC_TOKEN || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: process.env.BASE_USDT_TOKEN || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};

// Default: ~11 hours of Base blocks (2s/block). Override with --blocks N
// if the deposit is older than that, or pin an exact window with
// --from-block N --to-block N if you know roughly when it happened
// (e.g. from Basescan) -- much faster than scanning a huge lookback.
function argVal(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? parseInt(process.argv[i + 1], 10) : null;
}
const LOOKBACK_BLOCKS = argVal("--blocks") ?? 20000;
const EXPLICIT_FROM   = argVal("--from-block");
const EXPLICIT_TO     = argVal("--to-block");

// The RPC provider's free tier rejects eth_getLogs ranges wider than this
// (confirmed by the actual error message: "up to a 10 block range").
// Override with --chunk N if your provider allows more.
const CHUNK_SIZE = argVal("--chunk") ?? 10;
const DELAY_MS   = 150; // gentle pacing so we don't trip rate limits on top of range limits

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getLogsChunked(provider, filter, fromBlock, toBlock) {
  const allLogs = [];
  const totalChunks = Math.ceil((toBlock - fromBlock + 1) / CHUNK_SIZE);
  let chunkNum = 0;

  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
    chunkNum++;
    if (chunkNum % 25 === 0 || chunkNum === totalChunks) {
      console.log(`[BACKFILL]   chunk ${chunkNum}/${totalChunks} (blocks ${start}-${end})`);
    }

    const logs = await provider.getLogs({ ...filter, fromBlock: start, toBlock: end });
    if (logs.length > 0) allLogs.push(...logs);

    if (chunkNum < totalChunks) await sleep(DELAY_MS);
  }

  return allLogs;
}

async function sweepAddress(provider, addr, symbol, tokenAddress, balance, decimals) {
  if (addr.hdIndex == null || !TREASURY_WALLET) {
    console.warn(`[BACKFILL] ${addr.address}: no hdIndex or no treasury wallet configured — skipping sweep`);
    return;
  }

  const derived = await deriveBaseAddress(addr.hdIndex);
  if (!derived?.privateKey) throw new Error("No private key derived");

  const signer      = new ethers.Wallet(derived.privateKey, provider);
  const tokenSigner = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

  const ethBal = await provider.getBalance(addr.address);
  if (ethBal < ethers.parseEther("0.0001")) {
    console.warn(`[BACKFILL] ${addr.address} has no ETH for gas — deposit recorded, sweep skipped (will retry on next normal cycle)`);
    return;
  }

  const tx = await tokenSigner.transfer(TREASURY_WALLET, balance);
  const receipt = await tx.wait();
  console.log(`[BACKFILL] Swept ${ethers.formatUnits(balance, decimals)} ${symbol} → treasury | tx: ${receipt.hash}`);
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI not set — check your .env");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[BACKFILL] Connected to Mongo");

  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const latest = await provider.getBlockNumber();
  const fromBlock = EXPLICIT_FROM ?? Math.max(latest - LOOKBACK_BLOCKS, 0);
  const toBlockOverall = EXPLICIT_TO ?? latest;
  const totalRequests = Math.ceil((toBlockOverall - fromBlock + 1) / CHUNK_SIZE) * Object.keys(TOKENS).length;
  console.log(`[BACKFILL] Scanning blocks ${fromBlock} -> ${toBlockOverall} in chunks of ${CHUNK_SIZE} (~${totalRequests} RPC calls total, ~${Math.round(totalRequests * DELAY_MS / 1000)}s)`);

  const addresses = await DepositAddress.find({
    chain:  "base",
    token:  { $in: ["USDC", "USDT", "*"] },
    status: "active",
  });
  console.log(`[BACKFILL] ${addresses.length} address(es) to check`);

  if (addresses.length === 0) {
    console.log("[BACKFILL] Nothing to scan. Exiting.");
    await mongoose.disconnect();
    return;
  }

  const addrByLower = new Map(addresses.map(a => [a.address.toLowerCase(), a]));
  const paddedAddresses = addresses.map(a => ethers.zeroPadValue(a.address, 32));

  for (const [symbol, tokenAddress] of Object.entries(TOKENS)) {
    const decimals = TOKEN_DECIMALS[symbol] || 6;
    console.log(`[BACKFILL] --- Scanning ${symbol} ---`);

    const logs = await getLogsChunked(
      provider,
      { address: tokenAddress, topics: [TRANSFER_TOPIC, null, paddedAddresses] },
      fromBlock,
      toBlockOverall
    );

    console.log(`[BACKFILL] ${symbol}: ${logs.length} matching transfer(s) found`);

    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    for (const log of logs) {
      const parsed = TRANSFER_IFACE.parseLog(log);
      const toAddr = parsed.args.to.toLowerCase();
      const addr = addrByLower.get(toAddr);
      if (!addr) continue;

      const amount = parseFloat(ethers.formatUnits(parsed.args.value, decimals));
      if (amount < 0.01) continue;

      console.log(`[BACKFILL] Detected ${amount} ${symbol} at ${addr.address} tx=${log.transactionHash}`);

      let result;
      try {
        result = await createDetectedDeposit({
          userId:  addr.userId,
          token:   symbol,
          amount,
          txHash:  log.transactionHash,
          address: addr.address,
          chain:   "base",
        });
      } catch (err) {
        console.error(`[BACKFILL] createDetectedDeposit failed for ${addr.address}:`, err.message);
        continue;
      }

      if (!result) {
        console.log(`[BACKFILL] ${log.transactionHash} already recorded — skipping sweep`);
        continue;
      }

      const currentBalance = await token.balanceOf(addr.address);
      if (currentBalance > 0n) {
        await sweepAddress(provider, addr, symbol, tokenAddress, currentBalance, decimals);
      }
    }
  }

  console.log("[BACKFILL] Done.");
  await mongoose.disconnect();
}

run().catch(err => {
  console.error("[BACKFILL] Fatal:", err);
  process.exit(1);
});
