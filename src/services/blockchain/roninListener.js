// src/services/blockchain/roninListener.js
import { ethers }                from "ethers";
import DepositAddress            from "../../models/depositAddressModel.js";
import { createDetectedDeposit } from "../cryptoDepositPipeline.js";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
];

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const TRANSFER_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

// Same two tokens roninListener.js already served — no new tokens added here.
// TODO confirm: are these both 6-decimal on Ronin the same as their Base
// counterparts? Hardcoding like baseStableListener.js does, but flag if wrong.
const RONIN_TOKENS = {
  USDC: "0x0b7007c13325c48911f73a2dad5fa5dcbf808adc",
  USDT: "0x1c84981f3b05dde0a2ab8e3a78bc3a32a0564cb4",
};
const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6,
};

// This is the same public endpoint that was throwing 429s in flowerWatcherService.js.
// If you have a dedicated/paid Ronin RPC key, set RONIN_RPC to that instead —
// batching alone may not be enough if this is still the shared public node.
const RONIN_RPC = process.env.RONIN_RPC || "https://api.roninchain.com/rpc";

// Ronin's RPC caps eth_getLogs at a 200-block range per call (per
// flowerWatcherService.js's own comment) — unlike Base, a single call
// across the whole lookback window isn't allowed here, so we chunk.
const CHUNK_SIZE       = 200;
const LOOKBACK_BLOCKS  = 500;  // window used on first run for each token
const MAX_CATCHUP      = 5000; // safety cap if the listener was down a while

const provider = new ethers.JsonRpcProvider(RONIN_RPC);

// Resume-point tracking per token — mirrors the per-order lastScannedBlock
// pattern in flowerWatcherService.js, but here it's per-token since one
// call now covers every address instead of one call per order/address.
const lastScannedBlock = { USDC: null, USDT: null };

async function getLogsChunked(tokenAddress, paddedAddresses, fromBlock, toBlock) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
    const chunkLogs = await provider.getLogs({
      address: tokenAddress,
      topics:  [TRANSFER_TOPIC, null, paddedAddresses],
      fromBlock: start,
      toBlock: end
    });
    logs.push(...chunkLogs);
  }
  return logs;
}

async function scanToken(symbol, tokenAddress, addresses) {
  const addrByLower = new Map(addresses.map(a => [a.address.toLowerCase(), a]));
  const paddedAddresses = addresses.map(a => ethers.zeroPadValue(a.address, 32));
  const decimals = TOKEN_DECIMALS[symbol] || 6;

  const latest = await provider.getBlockNumber();

  let fromBlock;
  if (lastScannedBlock[symbol] !== null) {
    fromBlock = lastScannedBlock[symbol] + 1;
    const cappedFrom = latest - MAX_CATCHUP;
    if (fromBlock < cappedFrom) {
      console.warn(`[RONIN] ${symbol} — resume point ${fromBlock} is more than ${MAX_CATCHUP} blocks behind, capping catch-up window`);
      fromBlock = cappedFrom;
    }
  } else {
    fromBlock = latest - LOOKBACK_BLOCKS;
  }
  fromBlock = Math.max(fromBlock, 0);

  if (fromBlock > latest) return; // nothing new yet

  const logs = await getLogsChunked(tokenAddress, paddedAddresses, fromBlock, latest);
  lastScannedBlock[symbol] = latest;

  if (logs.length === 0) {
    console.log(`[RONIN] ${symbol} blocks ${fromBlock}-${latest}, ${addresses.length} addresses watched, 0 hits`);
    return;
  }

  for (const log of logs) {
    const parsed = TRANSFER_IFACE.parseLog(log);
    const toAddr = parsed.args.to.toLowerCase();
    const addr = addrByLower.get(toAddr);
    if (!addr) continue; // shouldn't happen given the topic filter

    const amount = parseFloat(ethers.formatUnits(parsed.args.value, decimals));
    if (amount <= 0) continue;

    console.log(`[RONIN DETECTED] user=${addr.userId} amount=${amount} ${symbol} tx=${log.transactionHash}`);

    // createDetectedDeposit does the atomic upsert-by-txHash dedup — same
    // guarantee as the Base stable listener, real hash from the event itself.
    const result = await createDetectedDeposit({
      userId:  addr.userId,
      token:   symbol,
      amount,
      txHash:  log.transactionHash,
      address: addr.address,
      chain:   "ronin"
    }).catch(err => {
      console.error(`[RONIN] createDetectedDeposit failed for ${addr.address}:`, err.message);
      return null;
    });

    if (!result) continue; // already recorded, or failed — nothing further to do here

    // NOTE: unlike Base's stable listener, the original roninListener.js had
    // no sweep-to-treasury step for USDC/USDT — deposits were only recorded.
    // Leaving that as-is here rather than inventing a sweep step. Confirm
    // whether Ronin USDC/USDT settlement is still meant to be the manual
    // admin cashout flow, or whether a sweep should be added to match Base.
  }
}

export async function startRoninListener() {
  console.log("[RONIN LISTENER] starting — batched log scan (200-block chunks) every 15s");

  setInterval(async () => {
    try {
      const addresses = await DepositAddress.find({ status: "active", chain: "ronin" });
      if (addresses.length === 0) return;

      for (const [symbol, tokenAddress] of Object.entries(RONIN_TOKENS)) {
        try {
          await scanToken(symbol, tokenAddress, addresses);
        } catch (err) {
          console.error(`[RONIN] Error scanning ${symbol}:`, err.message);
        }
      }
    } catch (err) {
      console.error("[RONIN LISTENER ERROR]", err.message);
    }
  }, 15000);

  console.log("[RONIN LISTENER] running");
}
