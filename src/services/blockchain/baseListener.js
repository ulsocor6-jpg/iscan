// src/services/blockchain/baseListener.js
import { ethers }                    from "ethers";
import crypto                        from "crypto";
import DepositAddress                from "../../models/depositAddressModel.js";
import FlowerOrder                   from "../../models/flower/flowerOrderModel.js";
import { processSwap }               from "../flowerSwapServiceBase.js";
import { sweepFlowerToTreasuryBase } from "../flower/flowerSweepServiceBase.js";

const provider = new ethers.JsonRpcProvider(
  process.env.BASE_RPC || "https://mainnet.base.org"
);

const FLOWER_TOKEN_ADDRESS = process.env.BASE_DEPOSIT_TOKEN;

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const TRANSFER_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

const FLOWER = new ethers.Contract(
  FLOWER_TOKEN_ADDRESS,
  [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ],
  provider
);

let _decimals = null;
async function getDecimals() {
  if (_decimals !== null) return _decimals;
  _decimals = await FLOWER.decimals();
  return _decimals;
}

// How many blocks back to look each cycle. Keep this >= (poll interval / block time)
// with margin, so back-to-back cycles always overlap and nothing falls in a gap.
const LOOKBACK_BLOCKS = 150;

// Resume-point tracking so a missed cycle (RPC error, restart) doesn't lose deposits
// that fall outside LOOKBACK_BLOCKS. Mirrors the pattern used on the Ronin watcher.
let lastScannedBlock = null;

// After a deposit is recorded, the FLOWER sitting at the user's address must
// be swept to treasury BEFORE processSwap runs — otherwise processSwap uses
// the treasury's own pre-existing FLOWER balance, decoupled from whether this
// user's deposit ever moved (the bug fixed in commit b359a3f, 2026-07-05).
async function sweepThenSwap(orderId) {
  try {
    await sweepFlowerToTreasuryBase(orderId);
  } catch (err) {
    if (err.stage === "post-transfer") {
      // A transfer may already be broadcast/pending on-chain. Do NOT retry
      // automatically — that risks a double-send. This needs manual/admin
      // review before anything touches this order again.
      console.error(
        `[BASE LISTENER] CRITICAL — sweep for ${orderId} failed AFTER broadcast. ` +
        `Do not auto-retry. Manual reconciliation required:`, err.message
      );
    } else {
      // Nothing was sent on-chain (validation failure, insufficient balance,
      // HD mismatch, etc.) — safe to leave at DEPOSIT_RECEIVED for a later
      // retry, but processSwap must NOT run until sweep actually succeeds.
      console.error(
        `[BASE LISTENER] Sweep for ${orderId} failed before any transfer — ` +
        `will remain unswept until retried:`, err.message
      );
    }
    return; // processSwap intentionally NOT called
  }

  processSwap(orderId).catch(err =>
    console.error(`[BASE LISTENER] processSwap failed for ${orderId}:`, err.message)
  );
}

async function handleNewDeposit({ addr, newAmount, txHash }) {
  const existing = await FlowerOrder.findOne({
    depositAddress: addr.address.toLowerCase(),
    chain:          "BASE",
    status:         { $in: ["WAITING_DEPOSIT", "DEPOSIT_RECEIVED", "VERIFIED", "SWAPPING"] }
  });

  if (existing) {
    existing.receivedAmount = newAmount;
    existing.status         = "DEPOSIT_RECEIVED";
    existing.txHash         = txHash;
    await existing.save();
    console.log(`[BASE LISTENER] Updated order ${existing.orderId} — ${newAmount} FLOWER tx=${txHash}`);
    await sweepThenSwap(existing.orderId);
    return;
  }

  const orderId = "FLW-BASE-" + crypto.randomBytes(6).toString("hex");
  await FlowerOrder.create({
    orderId,
    userId:         addr.userId,
    token:          "FLOWER",
    chain:          "BASE",
    depositAddress: addr.address.toLowerCase(),
    expectedAmount: newAmount,
    receivedAmount: newAmount,
    status:         "DEPOSIT_RECEIVED",
    txHash
  });

  console.log(`[BASE LISTENER] Created order ${orderId} — ${newAmount} FLOWER from ${addr.address} tx=${txHash}`);
  await sweepThenSwap(orderId);
}

async function scanForDeposits() {
  const addresses = await DepositAddress.find({ chain: "base", token: "FLOWER", status: "active" });
  if (addresses.length === 0) return;

  const addrByLower = new Map(addresses.map(a => [a.address.toLowerCase(), a]));
  const paddedAddresses = addresses.map(a => ethers.zeroPadValue(a.address, 32));

  const latest = await provider.getBlockNumber();
  const fromBlock = lastScannedBlock !== null
    ? Math.min(lastScannedBlock + 1, latest - LOOKBACK_BLOCKS) // never skip a gap
    : Math.max(latest - LOOKBACK_BLOCKS, 0);

  // Single request covers every watched address — this replaces the old
  // one-balanceOf-call-per-address loop.
  const logs = await provider.getLogs({
    address: FLOWER_TOKEN_ADDRESS,
    topics: [TRANSFER_TOPIC, null, paddedAddresses],
    fromBlock,
    toBlock: latest
  });

  lastScannedBlock = latest;

  if (logs.length === 0) {
    console.log(`[BASE SCAN] blocks ${fromBlock}-${latest}, ${addresses.length} addresses watched, 0 hits`);
    return;
  }

  const decimals = await getDecimals();

  for (const log of logs) {
    const parsed = TRANSFER_IFACE.parseLog(log);
    const toAddr = parsed.args.to.toLowerCase();
    const addr = addrByLower.get(toAddr);
    if (!addr) continue; // shouldn't happen given the topic filter, but stay safe

    // Idempotency: a deposit is recorded once, even if this tx shows up in an
    // overlapping scan window on the next cycle.
    const dup = await FlowerOrder.findOne({ txHash: log.transactionHash });
    if (dup) continue;

    const newAmount = parseFloat(ethers.formatUnits(parsed.args.value, decimals));
    if (newAmount <= 0.001) continue;

    console.log(`[BASE SCAN] hit ${addr.address} +${newAmount} FLOWER tx=${log.transactionHash}`);
    await handleNewDeposit({ addr, newAmount, txHash: log.transactionHash });
  }
}

export async function startBaseListener() {
  if (!FLOWER_TOKEN_ADDRESS) {
    console.error("[BASE LISTENER] BASE_DEPOSIT_TOKEN not set — not started"); return;
  }
  if (!process.env.BASE_TREASURY_PRIVATE_KEY) {
    console.error("[BASE LISTENER] BASE_TREASURY_PRIVATE_KEY not set — not started"); return;
  }

  console.log("[BASE LISTENER] starting — batched log scan every 15s");

  setInterval(async () => {
    try {
      await scanForDeposits();
    } catch (err) {
      console.error("[BASE LISTENER ERROR]", err.message);
    }
  }, 15000);

  console.log("[BASE LISTENER] running");
}
