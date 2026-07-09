// src/services/flowerWatcherService.js

import { ethers }                  from "ethers";
import FlowerOrder                 from "../../models/flower/flowerOrderModel.js";
import flowerConfig                from "../../../config/flower.js";
import { ERC20_ABI }               from "../../../config/katana.js";
import { sweepFlowerToTreasury }   from "./flowerSweepService.js";
import { processSwap }             from "./flowerSwapService.js";

const { MIN_CONFIRMATIONS, RONIN_RPC, FLOWER_TOKEN } = flowerConfig;

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const TRANSFER_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);

let provider = null;
function getProvider() {
  if (!provider) provider = new ethers.JsonRpcProvider(RONIN_RPC);
  return provider;
}

// Ronin's RPC caps eth_getLogs at a 200-block range per call.
const CHUNK_SIZE      = 200;
const INITIAL_LOOKBACK = 500;   // window used the first time anything is scanned
const MAX_CATCHUP      = 5000;  // safety cap if the watcher was down for a while

// Single global resume point, shared across ALL pending orders — this is the
// key change. Previously each order tracked its own lastScannedBlock and ran
// its own chunked scan, so N pending orders meant N full scans per poll.
// Now one scan covers every address at once, regardless of order count.
let lastScannedBlock = null;

async function getLogsChunked(contract, addressList, fromBlock, toBlock) {
  const filter = {
    address: FLOWER_TOKEN,
    topics:  [TRANSFER_TOPIC, null, addressList]
  };
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
    const chunkLogs = await getProvider().getLogs({ ...filter, fromBlock: start, toBlock: end });
    logs.push(...chunkLogs);
  }
  return logs;
}

// Phase 1: orders that already have a txHash — waiting on confirmations,
// then sweep + swap. Each needs its own receipt lookup (can't be batched
// into one filtered call the way Transfer events can), but these are
// parallelized and share a single getBlockNumber() call instead of one
// per order.
async function checkConfirmations(ordersWithTxHash, currentBlock) {
  await Promise.all(ordersWithTxHash.map(async (order) => {
    try {
      const receipt = await getProvider().getTransactionReceipt(order.txHash);
      if (!receipt) return;

      const confirmations = currentBlock - receipt.blockNumber;
      if (confirmations < MIN_CONFIRMATIONS) {
        console.log(`[FlowerWatcher] ${order.orderId} — ${confirmations}/${MIN_CONFIRMATIONS} confirmations`);
        return;
      }

      if (order.status === "DEPOSIT_RECEIVED") {
        console.log(`[FlowerWatcher] ${order.orderId} — confirmed. Sweeping to treasury...`);
        // Fully automated on-chain chain: sweep -> swap. Nothing manual here.
        await sweepFlowerToTreasury(order.orderId);
        await processSwap(order.orderId);
      }
    } catch (err) {
      console.error(`[FlowerWatcher] Error checking confirmations for ${order.orderId}:`, err.message);
    }
  }));
}

// Phase 2: orders with no txHash yet — one batched scan across every such
// order's deposit address, instead of one scan per order.
async function scanForNewDeposits(ordersAwaitingDeposit, currentBlock) {
  if (ordersAwaitingDeposit.length === 0) return;

  const rpc      = getProvider();
  const contract = new ethers.Contract(FLOWER_TOKEN, ERC20_ABI, rpc);
  const decimals = await contract.decimals();

  // flowerOrderGuard already prevents a second active order on an address
  // that has one, so address -> order should be effectively 1:1 among the
  // orders we're scanning for.
  const orderByAddress = new Map(
    ordersAwaitingDeposit.map(o => [o.depositAddress.toLowerCase(), o])
  );
  const addressList = ordersAwaitingDeposit.map(o => ethers.zeroPadValue(o.depositAddress, 32));

  let fromBlock;
  if (lastScannedBlock !== null) {
    fromBlock = lastScannedBlock + 1;
    const cappedFrom = currentBlock - MAX_CATCHUP;
    if (fromBlock < cappedFrom) {
      console.warn(`[FlowerWatcher] resume point ${fromBlock} is more than ${MAX_CATCHUP} blocks behind, capping catch-up window`);
      fromBlock = cappedFrom;
    }
  } else {
    fromBlock = currentBlock - INITIAL_LOOKBACK;
  }
  fromBlock = Math.max(fromBlock, 0);

  if (fromBlock > currentBlock) return; // nothing new yet

  const logs = await getLogsChunked(contract, addressList, fromBlock, currentBlock);
  lastScannedBlock = currentBlock;

  if (logs.length === 0) {
    console.log(`[FlowerWatcher] blocks ${fromBlock}-${currentBlock}, ${ordersAwaitingDeposit.length} address(es) watched, 0 hits`);
    return;
  }

  for (const log of logs) {
    const parsed = TRANSFER_IFACE.parseLog(log);
    const toAddr = parsed.args.to.toLowerCase();
    const order  = orderByAddress.get(toAddr);
    if (!order) continue; // shouldn't happen given the topic filter

    const amount    = parseFloat(ethers.formatUnits(parsed.args.value, decimals));
    const tolerance = order.expectedAmount * 0.01;
    if (Math.abs(amount - order.expectedAmount) > tolerance) continue;

    console.log(`[FlowerWatcher] ${order.orderId} — deposit found: ${amount} FLOWER (tx: ${log.transactionHash})`);

    await FlowerOrder.updateOne(
      { orderId: order.orderId },
      {
        status:         "DEPOSIT_RECEIVED",
        txHash:         log.transactionHash,
        receivedAmount: amount
      }
    );
    // Sweep + swap will pick this order up on the NEXT poll, once it has a
    // txHash and confirmations are checked in phase 1 above — same as before.
  }
}

export async function watchPendingOrders() {
  const orders = await FlowerOrder.find({
    status: { $in: ["WAITING_DEPOSIT", "DEPOSIT_RECEIVED"] }
  });

  if (orders.length === 0) return;

  const ordersWithTxHash     = orders.filter(o => o.txHash);
  const ordersAwaitingDeposit = orders.filter(o => !o.txHash);

  console.log(`[FlowerWatcher] Checking ${orders.length} pending order(s) — ${ordersWithTxHash.length} awaiting confirmation, ${ordersAwaitingDeposit.length} awaiting deposit`);

  const currentBlock = await getProvider().getBlockNumber();

  await checkConfirmations(ordersWithTxHash, currentBlock);
  await scanForNewDeposits(ordersAwaitingDeposit, currentBlock);
}

// Manual confirm — for testing or watcher miss. This remains the one
// legitimate manual on-chain override; normal flow is fully automated above.
export async function confirmByTxHash(orderId, txHash) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  await FlowerOrder.updateOne(
    { orderId },
    { txHash, status: "DEPOSIT_RECEIVED" }
  );

  const updated = await FlowerOrder.findOne({ orderId });
  const currentBlock = await getProvider().getBlockNumber();
  await checkConfirmations([updated], currentBlock);
}

let intervalHandle = null;

export function startFlowerWatcher(intervalMs = 20000) {
  if (intervalHandle) {
    console.warn("[FlowerWatcher] startFlowerWatcher() called again - already running, ignoring.");
    return;
  }

  console.log(`[FlowerWatcher] starting - batched poll every ${intervalMs / 1000}s`);

  intervalHandle = setInterval(async () => {
    try {
      await watchPendingOrders();
    } catch (err) {
      console.error("[FlowerWatcher] poll error:", err.message);
    }
  }, intervalMs);

  console.log("[FlowerWatcher] running");
}

export function stopFlowerWatcher() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export default { watchPendingOrders, confirmByTxHash, startFlowerWatcher, stopFlowerWatcher };
