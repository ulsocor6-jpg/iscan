import axios from "axios";
import DepositAddress from "../../models/depositAddressModel.js";
import { creditUser } from "../ledger/creditService.js";

const RONIN_API = "https://explorer.roninchain.com/api";

const RONIN_TOKENS = {
  USDC: "0x0b7007c13325c48911f73a2dad5fa5dcbf808adc",
  USDT: "0x1c84981f3b05dde0a2ab8e3a78bc3a32a0564cb4",
};

async function fetchTransactions(address) {
  try {
    const url = `${RONIN_API}/tokenTransfers?address=${address}&limit=20&offset=0`;
    const res = await axios.get(url, { timeout: 10000 });
    return res.data?.results || [];
  } catch (err) {
    console.error(`[RONIN] fetch error for ${address}:`, err.message);
    return [];
  }
}

async function processDeposit(tx, depositAddress, token) {
  const amount = Number(tx.value) / 1e6;
  if (amount <= 0) return;
  await creditUser({
    userId: depositAddress.userId,
    amount,
    asset: token,
    txHash: tx.transaction_hash,
    chain: "ronin",
  });
  console.log(`[RONIN DEPOSIT] user=${depositAddress.userId} +${amount} ${token} tx=${tx.transaction_hash}`);
}

export async function startRoninListener() {
  console.log("[RONIN LISTENER] starting...");
  setInterval(async () => {
    try {
      const addresses = await DepositAddress.find({ status: "active", chain: "ronin" });
      for (const addr of addresses) {
        const txs = await fetchTransactions(addr.address);
        for (const tx of txs) {
          if (tx.to?.toLowerCase() !== addr.address.toLowerCase()) continue;
          const tokenEntry = Object.entries(RONIN_TOKENS).find(
            ([, contract]) => contract.toLowerCase() === tx.token_address?.toLowerCase()
          );
          if (!tokenEntry) continue;
          const [token] = tokenEntry;
          if (addr.lastTxHash === tx.transaction_hash) continue;
          await processDeposit(tx, addr, token);
          addr.lastTxHash = tx.transaction_hash;
          addr.lastAmount = Number(tx.value) / 1e6;
          await addr.save();
        }
      }
    } catch (err) {
      console.error("[RONIN LISTENER ERROR]", err.message);
    }
  }, 15000);
  console.log("[RONIN LISTENER] running — polling every 15s");
}
