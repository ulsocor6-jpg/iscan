// src/services/blockchain/baseListener.js
import { ethers }                    from "ethers";
import crypto                        from "crypto";
import DepositAddress                from "../../models/depositAddressModel.js";
import FlowerOrder                   from "../../models/flower/flowerOrderModel.js";
import { processSwap }               from "../flowerSwapServiceBase.js";
import { sweepFlowerToTreasuryBase } from "../flower/flowerSweepServiceBase.js";

const HTTP_RPC = process.env.BASE_RPC || "https://mainnet.base.org";
const WS_RPC   = process.env.BASE_WS_RPC || null;

const httpProvider = new ethers.JsonRpcProvider(HTTP_RPC);

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
  httpProvider
);

let _decimals = null;
async function getDecimals() {
  if (_decimals !== null) return _decimals;
  _decimals = await FLOWER.decimals();
  return _decimals;
}

// In-memory cache of watched addresses, refreshed periodically from the DB
// (cheap, no RPC cost) so newly created deposit addresses get picked up
// without needing to tear down and rebuild the WebSocket subscription.
let addrByLower = new Map();
async function refreshWatchedAddresses() {
  const addresses = await DepositAddress.find({ chain: "base", token: "FLOWER", status: "active" });
  addrByLower = new Map(addresses.map(a => [a.address.toLowerCase(), a]));
}

// After a deposit is recorded, the FLOWER sitting at the user's address must
// be swept to treasury BEFORE processSwap runs — otherwise processSwap uses
// the treasury's own pre-existing FLOWER balance, decoupled from whether this
// user's deposit ever moved (the bug fixed in commit b359a3f, 2026-07-05).
async function sweepThenSwap(orderId) {
  try {
    await sweepFlowerToTreasuryBase(orderId);
  } catch (err) {
    if (err.stage === "post-transfer") {
      console.error(
        `[BASE LISTENER] CRITICAL — sweep for ${orderId} failed AFTER broadcast. ` +
        `Do not auto-retry. Manual reconciliation required:`, err.message
      );
    } else {
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

async function handleTransferLog(log) {
  try {
    const parsed = TRANSFER_IFACE.parseLog(log);
    const toAddr = parsed.args.to.toLowerCase();
    const addr = addrByLower.get(toAddr);
    if (!addr) return; // not one of our watched deposit addresses

    // Idempotency: a deposit is recorded once, even if this tx is seen twice
    // (e.g. once via WebSocket, once via the backstop poll).
    const dup = await FlowerOrder.findOne({ txHash: log.transactionHash });
    if (dup) return;

    const decimals = await getDecimals();
    const newAmount = parseFloat(ethers.formatUnits(parsed.args.value, decimals));
    if (newAmount <= 0.001) return;

    console.log(`[BASE LIVE] hit ${addr.address} +${newAmount} FLOWER tx=${log.transactionHash}`);
    await handleNewDeposit({ addr, newAmount, txHash: log.transactionHash });
  } catch (err) {
    if (err.code === 11000) {
      console.log(`[BASE LISTENER] duplicate txHash ${log.transactionHash} — already processed, skipping`);
      return;
    }
    console.error("[BASE LISTENER] failed to handle transfer log:", err.message);
  }
}

// ---- Backstop poll ---------------------------------------------------
// The WebSocket subscription handles the real-time path. This poll exists
// only to catch deposits missed during a WS disconnect/reconnect window —
// it runs every 5 minutes instead of the old 15-second loop, since it is
// no longer the primary detection path.
const BACKSTOP_LOOKBACK_BLOCKS = 300;
let lastScannedBlock = null;

async function backstopScan() {
  if (addrByLower.size === 0) return;

  const paddedAddresses = [...addrByLower.keys()].map(a => ethers.zeroPadValue(a, 32));
  const latest = await httpProvider.getBlockNumber();
  const fromBlock = lastScannedBlock !== null
    ? Math.min(lastScannedBlock + 1, latest - BACKSTOP_LOOKBACK_BLOCKS)
    : Math.max(latest - BACKSTOP_LOOKBACK_BLOCKS, 0);

  const logs = await httpProvider.getLogs({
    address: FLOWER_TOKEN_ADDRESS,
    topics: [TRANSFER_TOPIC, null, paddedAddresses],
    fromBlock,
    toBlock: latest
  });

  lastScannedBlock = latest;
  if (logs.length === 0) {
    console.log(`[BASE BACKSTOP] blocks ${fromBlock}-${latest}, ${addrByLower.size} addresses watched, 0 hits`);
    return;
  }

  console.log(`[BASE BACKSTOP] blocks ${fromBlock}-${latest}, ${logs.length} hit(s)`);
  for (const log of logs) await handleTransferLog(log);
}

// ---- WebSocket subscription (reactive) --------------------------------
let wsProvider = null;
let wsReconnectAttempts = 0;

function connectWebSocket() {
  if (!WS_RPC) {
    console.warn("[BASE LISTENER] BASE_WS_RPC not set — running on backstop polling only");
    return;
  }

  wsProvider = new ethers.WebSocketProvider(WS_RPC);

  const filter = { address: FLOWER_TOKEN_ADDRESS, topics: [TRANSFER_TOPIC] };

  wsProvider.on(filter, (log) => {
    handleTransferLog(log);
  });

  wsProvider.websocket.on("open", () => {
    wsReconnectAttempts = 0;
    console.log("[BASE LISTENER] WebSocket connected — live subscription active");
  });

  wsProvider.websocket.on("close", () => {
    console.warn("[BASE LISTENER] WebSocket closed — reconnecting...");
    scheduleReconnect();
  });

  wsProvider.websocket.on("error", (err) => {
    console.error("[BASE LISTENER] WebSocket error:", err.message);
  });
}

function scheduleReconnect() {
  wsReconnectAttempts++;
  const delay = Math.min(30000, 1000 * 2 ** wsReconnectAttempts);
  console.log(`[BASE LISTENER] reconnecting in ${delay}ms (attempt ${wsReconnectAttempts})`);
  setTimeout(connectWebSocket, delay);
}

export async function startBaseListener() {
  if (!FLOWER_TOKEN_ADDRESS) {
    console.error("[BASE LISTENER] BASE_DEPOSIT_TOKEN not set — not started"); return;
  }
  if (!process.env.BASE_TREASURY_PRIVATE_KEY) {
    console.error("[BASE LISTENER] BASE_TREASURY_PRIVATE_KEY not set — not started"); return;
  }

  await refreshWatchedAddresses();
  setInterval(refreshWatchedAddresses, 60000);

  connectWebSocket();

  setInterval(async () => {
    try {
      await backstopScan();
    } catch (err) {
      console.error("[BASE LISTENER ERROR]", err.message);
    }
  }, 5 * 60 * 1000);

  console.log("[BASE LISTENER] starting — reactive WebSocket + 5min backstop poll");
}
