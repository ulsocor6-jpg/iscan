// src/services/blockchain/baseStableListener.js
// Watches Base chain deposit addresses for USDC/USDT deposits
// then sweeps them to treasury and credits the user's ledger.

import { ethers }            from "ethers";
import DepositAddress        from "../../models/depositAddressModel.js";
import { createDetectedDeposit } from "../cryptoDepositPipeline.js";
import { deriveBaseAddress } from "../hdWalletService.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const TRANSFER_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

// Hardcode decimals — some Base tokens don't expose decimals()
const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6,
};

const BASE_RPC           = process.env.BASE_RPC || "https://mainnet.base.org";
const TREASURY_WALLET    = process.env.BASE_TREASURY_WALLET;
const TREASURY_PRIV_KEY  = process.env.BASE_TREASURY_PRIVATE_KEY;

const TOKENS = {
  USDC: process.env.BASE_USDC_TOKEN || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: process.env.BASE_USDT_TOKEN || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};

const provider = new ethers.JsonRpcProvider(BASE_RPC);

// How many blocks back to look each cycle. Must comfortably exceed
// (poll interval / avg block time) so consecutive cycles always overlap.
const LOOKBACK_BLOCKS = 150;

// Resume-point tracking per token so a slow/failed cycle never leaves a gap.
const lastScannedBlock = { USDC: null, USDT: null };

async function sweepAddress(addr, symbol, tokenAddress, balance, decimals) {
  if (addr.hdIndex == null || !TREASURY_WALLET) return;

  try {
    const derived = await deriveBaseAddress(addr.hdIndex);
    if (!derived?.privateKey) throw new Error("No private key derived");

    const signer      = new ethers.Wallet(derived.privateKey, provider);
    const tokenSigner = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

    const ethBal = await provider.getBalance(addr.address);
    if (ethBal < ethers.parseEther("0.0001")) {
      console.warn(`[BASE STABLE] ${addr.address} has no ETH for gas — sweep skipped, deposit already recorded`);
      return;
    }

    const tx      = await tokenSigner.transfer(TREASURY_WALLET, balance);
    const receipt = await tx.wait();
    console.log(`[BASE STABLE] Swept ${ethers.formatUnits(balance, decimals)} ${symbol} → treasury | tx: ${receipt.hash}`);
  } catch (sweepErr) {
    // Sweep failing here is fine to retry later — it does NOT re-trigger
    // createDetectedDeposit, since that's already gated on real txHash dedup above.
    console.error(`[BASE STABLE] Sweep failed for ${addr.address} (${symbol}):`, sweepErr.message);
  }
}

async function scanToken(symbol, tokenAddress, addresses) {
  const addrByLower = new Map(addresses.map(a => [a.address.toLowerCase(), a]));
  const paddedAddresses = addresses.map(a => ethers.zeroPadValue(a.address, 32));
  const decimals = TOKEN_DECIMALS[symbol] || 6;

  const latest = await provider.getBlockNumber();
  const fromBlock = lastScannedBlock[symbol] !== null
    ? Math.min(lastScannedBlock[symbol] + 1, latest - LOOKBACK_BLOCKS)
    : Math.max(latest - LOOKBACK_BLOCKS, 0);

  // Single request covers every watched address for this token.
  const logs = await provider.getLogs({
    address: tokenAddress,
    topics: [TRANSFER_TOPIC, null, paddedAddresses],
    fromBlock,
    toBlock: latest
  });

  lastScannedBlock[symbol] = latest;

  if (logs.length === 0) {
    console.log(`[BASE STABLE] ${symbol} blocks ${fromBlock}-${latest}, ${addresses.length} addresses watched, 0 hits`);
    return;
  }

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  for (const log of logs) {
    const parsed = TRANSFER_IFACE.parseLog(log);
    const toAddr = parsed.args.to.toLowerCase();
    const addr = addrByLower.get(toAddr);
    if (!addr) continue; // shouldn't happen given the topic filter

    const amount = parseFloat(ethers.formatUnits(parsed.args.value, decimals));
    if (amount < 0.01) continue;

    console.log(`[BASE STABLE] Detected ${amount} ${symbol} at ${addr.address} tx=${log.transactionHash}`);

    // createDetectedDeposit does an atomic upsert keyed on txHash — it returns
    // null (and logs "Duplicate tx ignored") rather than throwing when this
    // txHash was already processed. That's the expected path on an overlapping
    // scan window, so just skip the sweep below rather than treating it as an error.
    let result;
    try {
      result = await createDetectedDeposit({
        userId:  addr.userId,
        token:   symbol,
        amount,
        txHash:  log.transactionHash,
        address: addr.address,
        chain:   "base"
      });
    } catch (err) {
      console.error(`[BASE STABLE] createDetectedDeposit failed for ${addr.address}:`, err.message);
      continue;
    }

    if (!result) continue; // already recorded — do not sweep again

    // Sweep whatever the address currently holds (covers this deposit plus
    // anything still unswept from a prior failed attempt).
    const currentBalance = await token.balanceOf(addr.address);
    if (currentBalance > 0n) {
      await sweepAddress(addr, symbol, tokenAddress, currentBalance, decimals);
    }
  }
}

export async function startBaseStableListener() {
  if (!TREASURY_WALLET) {
    console.error("[BASE STABLE] BASE_TREASURY_WALLET not set — not started");
    return;
  }

  console.log("[BASE STABLE] Starting USDC/USDT listener on Base — batched log scan every 30s");

  setInterval(async () => {
    try {
      const addresses = await DepositAddress.find({
        chain:  "base",
        token:  { $in: ["USDC", "USDT"] },
        status: "active"
      });

      if (addresses.length === 0) return;

      for (const [symbol, tokenAddress] of Object.entries(TOKENS)) {
        try {
          await scanToken(symbol, tokenAddress, addresses);
        } catch (err) {
          console.error(`[BASE STABLE] Error scanning ${symbol}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[BASE STABLE ERROR]", err.message);
    }
  }, 30000);
}
