import axios from "axios";
import DepositAddress from "../../models/depositAddressModel.js";
import { creditUser } from "../ledger/creditService.js";

const BASE_API    = "https://api.basescan.org/api";
const API_KEY     = process.env.BASESCAN_API_KEY || "";
const BASE_TOKENS = {
  FLOWER: (process.env.BASE_DEPOSIT_TOKEN || "0x3e12b9d6a4d12cd9b4a6d613872d0eb32f68b380").toLowerCase(),
};

async function fetchTransfers(address) {
  try {
    const res = await axios.get(BASE_API, {
      timeout: 10000,
      params: {
        module:     "account",
        action:     "tokentx",
        address,
        sort:       "desc",
        offset:     20,
        page:       1,
        apikey:     API_KEY || undefined,
      },
    });
    return res.data?.result || [];
  } catch (err) {
    console.error(`[BASE LISTENER] fetch error for ${address}:`, err.message);
    return [];
  }
}

async function processDeposit(tx, depositAddress, token) {
  const decimals = parseInt(tx.tokenDecimal) || 18;
  const amount   = Number(tx.value) / Math.pow(10, decimals);
  if (amount <= 0) return;
  await creditUser({
    userId:  depositAddress.userId,
    amount,
    asset:   token,
    txHash:  tx.hash,
    chain:   "base",
  });
  console.log(`[BASE DEPOSIT] user=${depositAddress.userId} +${amount} ${token} tx=${tx.hash}`);
}

export async function startBaseListener() {
  console.log("[BASE LISTENER] starting...");
  setInterval(async () => {
    try {
      const addresses = await DepositAddress.find({ status: "active", chain: "base" });
      for (const addr of addresses) {
        const txs = await fetchTransfers(addr.address);
        for (const tx of txs) {
          if (tx.to?.toLowerCase() !== addr.address.toLowerCase()) continue;
          const tokenKey = Object.entries(BASE_TOKENS).find(
            ([, contract]) => contract === tx.contractAddress?.toLowerCase()
          );
          if (!tokenKey) continue;
          const [token] = tokenKey;
          if (addr.lastTxHash === tx.hash) continue;
          await processDeposit(tx, addr, token);
          addr.lastTxHash  = tx.hash;
          addr.lastAmount  = Number(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal) || 18);
          await addr.save();
        }
      }
    } catch (err) {
      console.error("[BASE LISTENER ERROR]", err.message);
    }
  }, 15000);
  console.log("[BASE LISTENER] running — polling every 15s");
}
