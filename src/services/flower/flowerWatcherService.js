// src/services/flowerWatcherService.js

import { ethers }                  from "ethers";
import FlowerOrder                 from "../../models/flower/flowerOrderModel.js";
import flowerConfig                from "../../../config/flower.js";
import { ERC20_ABI }               from "../../../config/katana.js";
import { sweepFlowerToTreasury }   from "./flowerSweepService.js";
import { processSwap }             from "./flowerSwapService.js";

const { MIN_CONFIRMATIONS, RONIN_RPC, FLOWER_TOKEN } = flowerConfig;

let provider = null;
function getProvider() {
  if (!provider) provider = new ethers.JsonRpcProvider(RONIN_RPC);
  return provider;
}

export async function watchPendingOrders() {
  const orders = await FlowerOrder.find({
    status: { $in: ["WAITING_DEPOSIT", "DEPOSIT_RECEIVED"] }
  });

  if (orders.length === 0) return;
  console.log(`[FlowerWatcher] Checking ${orders.length} pending order(s)`);

  for (const order of orders) {
    try {
      await checkOrderDeposit(order);
    } catch (err) {
      console.error(`[FlowerWatcher] Error on ${order.orderId}:`, err.message);
    }
  }
}

async function checkOrderDeposit(order) {
  const rpc      = getProvider();
  const contract = new ethers.Contract(FLOWER_TOKEN, ERC20_ABI, rpc);

  // If txHash exists — check confirmations
  if (order.txHash) {
    const receipt = await rpc.getTransactionReceipt(order.txHash);
    if (!receipt) return;

    const currentBlock  = await rpc.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;

    if (confirmations < MIN_CONFIRMATIONS) {
      console.log(`[FlowerWatcher] ${order.orderId} — ${confirmations}/${MIN_CONFIRMATIONS} confirmations`);
      return;
    }

    if (order.status === "DEPOSIT_RECEIVED") {
      console.log(`[FlowerWatcher] ${order.orderId} — confirmed. Sweeping to treasury...`);
      // Step 1: sweep from HD address → treasury
      await sweepFlowerToTreasury(order.orderId);
      // Step 2: swap treasury FLOWER → USDC
      await processSwap(order.orderId);
    }
    return;
  }

  // No txHash yet — scan Transfer events to deposit address
  const currentBlock = await rpc.getBlockNumber();
  const fromBlock    = currentBlock - 500;
  const filter       = contract.filters.Transfer(null, order.depositAddress);
  const events       = await contract.queryFilter(filter, fromBlock, currentBlock);

  for (const event of events) {
    const amountRaw = event.args[2];
    const decimals  = await contract.decimals();
    const amount    = parseFloat(ethers.formatUnits(amountRaw, decimals));

    // Accept any amount within 1% of expected
    const tolerance = order.expectedAmount * 0.01;
    if (Math.abs(amount - order.expectedAmount) > tolerance) continue;

    console.log(`[FlowerWatcher] ${order.orderId} — deposit found: ${amount} FLOWER (tx: ${event.transactionHash})`);

    await FlowerOrder.updateOne(
      { orderId: order.orderId },
      {
        status:         "DEPOSIT_RECEIVED",
        txHash:          event.transactionHash,
        receivedAmount:  amount
      }
    );
    break;
  }
}

// Manual confirm — for testing or watcher miss
export async function confirmByTxHash(orderId, txHash) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  await FlowerOrder.updateOne(
    { orderId },
    { txHash, status: "DEPOSIT_RECEIVED" }
  );

  const updated = await FlowerOrder.findOne({ orderId });
  await checkOrderDeposit(updated);
}

export default { watchPendingOrders, confirmByTxHash };
