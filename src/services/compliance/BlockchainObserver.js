// src/services/compliance/BlockchainObserver.js (on‑demand version)
import { ethers } from "ethers";
import brainBus from "../../brainbus/brainBus.js";
import { Channels } from "../../brainbus/channels.js";

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const TRANSFER_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

const BASE_RPC = process.env.BASE_RPC || "https://mainnet.base.org";
const TOKENS = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
};
const TOKEN_DECIMALS = { USDC: 6, USDT: 6 };

const provider = new ethers.JsonRpcProvider(BASE_RPC);
const LOOKBACK_BLOCKS = 9; // ~10 minutes on Base

/**
 * Fetch recent transfer events where the given address is sender or receiver.
 * Called on-demand (e.g., when a deposit/withdrawal is detected).
 */
export async function scanAddress(address) {
  const addr = address.toLowerCase();
  const paddedAddr = ethers.zeroPadValue(addr, 32);
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(latest - LOOKBACK_BLOCKS, 0);

  for (const [symbol, tokenAddress] of Object.entries(TOKENS)) {
    try {
      // Query logs where this address is sender OR receiver
      const logs = await provider.getLogs({
        address: tokenAddress,
        topics: [TRANSFER_TOPIC],
        fromBlock,
        toBlock: latest,
      });

      // Filter locally for address match (since eth_getLogs doesn't support OR)
      const relevant = logs.filter(log => {
        const parsed = TRANSFER_IFACE.parseLog(log);
        if (!parsed) return false;
        const from = parsed.args.from.toLowerCase();
        const to = parsed.args.to.toLowerCase();
        return from === addr || to === addr;
      });

      for (const log of relevant) {
        const parsed = TRANSFER_IFACE.parseLog(log);
        const value = parseFloat(ethers.formatUnits(parsed.args.value, TOKEN_DECIMALS[symbol]));
        const event = {
          chain: "base",
          txHash: log.transactionHash,
          from: parsed.args.from.toLowerCase(),
          to: parsed.args.to.toLowerCase(),
          value,
          tokenSymbol: symbol,
          tokenAddress,
          blockNumber: log.blockNumber,
          timestamp: Date.now(),
        };
        brainBus.emit(Channels.COMPLIANCE_TRANSACTION, event, {
          source: "BlockchainObserver",
          correlationId: event.txHash,
        });
      }
      if (relevant.length) {
        console.log(`[ComplianceObserver] Scanned ${symbol} for ${addr}: ${relevant.length} txs`);
      }
    } catch (err) {
      console.error(`[ComplianceObserver] Error scanning ${symbol} for ${addr}:`, err.message);
    }
  }
}

// No automatic polling – we expose a simple no-op start for compatibility
export async function startBlockchainObserver() {
  console.log("[ComplianceObserver] On‑demand observer ready (no background polling)");
}
