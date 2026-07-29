import brainBus from "../../brainbus/brainBus.js";
import axios from "axios";
import DepositAddress from "../../models/depositAddressModel.js";
import { creditUser } from "../ledger/creditService.js";
import healthRegistry from "../../intelligence/healthRegistry.js";

/**
 * Simple TRON USDT scanner (MVP polling version)
 * Replace later with full node / webhook provider
 */

const TRONGRID_API = "https://api.trongrid.io";

async function fetchTransactions(address) {
  const url = `${TRONGRID_API}/v1/accounts/${address}/transactions/trc20?limit=20`;

  const res = await axios.get(url);
  return res.data?.data || [];
}

async function processDeposit(tx, depositAddress) {
  const amount = Number(tx.value) / 1e6; // USDT decimals

  if (amount <= 0) return;

  await creditUser({
    userId: depositAddress.userId,
    amount,
    txHash: tx.transaction_id,
    chain: "tron"
  });

  console.log(`[DEPOSIT CREDITED] ${depositAddress.userId} +${amount} USDT`);
}

export async function startTronListener() {
  console.log("[TRON LISTENER] running...");
  healthRegistry.registerNode({ node: "tronListener", type: "watcher" });
  healthRegistry.report({ node: "tronListener", status: "ONLINE" });

  // Event‑driven – wakes on deposit.created (USDT)
  async function tronPoll() {
    try {
      const addresses = await DepositAddress.find({ status: "active" });
      for (const addr of addresses) {
        const txs = await fetchTransactions(addr.address);
        for (const tx of txs) {
          if (tx.to !== addr.address) continue;
          if (tx.token_info?.symbol !== "USDT") continue;
          if (addr.lastTxHash === tx.transaction_id) continue;

          await processDeposit(tx, addr);
          addr.lastTxHash = tx.transaction_id;
          addr.lastAmount = Number(tx.value) / 1e6;
          await addr.save();
        }
      }
    } catch (err) {
      console.error("[TRON LISTENER ERROR]", err.message);
      healthRegistry.report({ node: "tronListener", status: "WARNING", error: err.message });
    }
  }
  brainBus.on("deposit.created", tronPoll);
  // Initial catch‑up
  tronPoll(); // every 15 sec (MVP)
}
