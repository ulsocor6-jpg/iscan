// src/services/flowerSwapService.js
// Executes the FLOWER → USDC swap on Katana DEX (Ronin).
// Called after deposit is VERIFIED.
// On success → triggers flowerSettlementService.

import { ethers }                               from "ethers";
import FlowerOrder                              from "../../models/flower/flowerOrderModel.js";
import FlowerSwap                               from "../../models/flower/flowerSwapModel.js";
import flowerConfig                             from "../../../config/flower.js";
import { KATANA_ROUTER_ABI, ERC20_ABI,
         RONIN_TOKENS, SWAP_DEADLINE_SECONDS }  from "../../../config/katana.js";
import { verifyOrder, calcMinOutput }           from "./flowerVerificationService.js";
import { recordPendingOperation, setPendingOperationAmount } from "../blockchain/pendingOperationService.js";
import { withLock } from "../utils/asyncMutex.js";


import { settle }                               from "./flowerSettlementService.js";

const {
  RONIN_RPC,
  TREASURY_PRIVATE_KEY,
  KATANA_ROUTER,
  FLOWER_TOKEN,
  PLATFORM_FEE
} = flowerConfig;

// ── Main entry — called by watcher after VERIFIED ────────────────────────────
export async function processSwap(orderId) {
  // 1. Verify order state + get live quote
  const { order, receivedAmount, quote, minOutputRaw } =
    await verifyOrder(orderId);

  // 2. Mark as SWAPPING (idempotency guard)
  const updated = await FlowerOrder.findOneAndUpdate(
    { orderId, status: { $in: ["VERIFIED", "DEPOSIT_RECEIVED"] } },
    { status: "SWAPPING" },
    { new: true }
  );
  if (!updated) {
    console.warn(`[FlowerSwap] ${orderId} already swapping or past that state — skipping`);
    return;
  }

  // 3. Set up signer (treasury wallet)
  const provider = new ethers.JsonRpcProvider(RONIN_RPC);
  const signer   = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
  const router   = new ethers.Contract(KATANA_ROUTER, KATANA_ROUTER_ABI, signer);
  const flower   = new ethers.Contract(FLOWER_TOKEN,  ERC20_ABI, signer);

  const amountInWei = ethers.parseUnits(receivedAmount.toString(), 18);
  const path        = [RONIN_TOKENS.FLOWER, RONIN_TOKENS.USDC];
  const deadline    = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS;

  // 4. Create swap record (PENDING)
  const swapRecord = await FlowerSwap.create({
    orderId,
    tokenIn:   "FLOWER",
    tokenOut:  "USDC",
    amountIn:   receivedAmount,
    dex:       "KATANA",
    slippage:   200, // 2% in bps
    status:    "PENDING"
  });

  try {
    // Serialize approve+execute per chain's treasury wallet. Without this,
    // two orders can interleave approve/swap calls on the same signer —
    // risking both a balance race (order B drains what order A's own
    // swept tokens just funded, see Base's c12c73c1 stuck-funds case) and
    // nonce ordering issues from concurrent txs off one wallet.
    const receipt = await withLock("flower:RONIN", async () => {
      // 5. Approve router to spend FLOWER
      console.log(`[FlowerSwap] ${orderId} — approving FLOWER spend`);
      const approveTx = await flower.approve(KATANA_ROUTER, amountInWei);
      await approveTx.wait();

      // 6. Execute swap
      console.log(`[FlowerSwap] ${orderId} — executing swap ${receivedAmount} FLOWER → USDC`);
      const swapTx = await router.swapExactTokensForTokens(
        amountInWei,
        minOutputRaw,   // slippage floor from verificationService
        path,
        signer.address, // USDC lands in treasury wallet
        deadline
      );
      return await swapTx.wait();
    });

    // 7. Parse USDC received from receipt logs
    const usdcReceived = parseUsdcFromReceipt(receipt, RONIN_TOKENS.USDC);

    // 8. Update swap record
    await FlowerSwap.updateOne(
      { _id: swapRecord._id },
      {
        txHash:    receipt.hash,
        amountOut: usdcReceived,
        status:    "COMPLETED"
      }
    );

    // 9. Update order with swap result
    await FlowerOrder.updateOne(
      { orderId },
      {
        status:      "SWAPPED",
        swapTxHash:   receipt.hash,
        usdcReceived: usdcReceived
      }
    );

    console.log(`[FlowerSwap] ${orderId} — swap complete: ${usdcReceived} USDC (tx: ${receipt.hash})`);

    // 10. Hand off to settlement. Separate try/catch: the on-chain swap
    // has ALREADY succeeded at this point (real tx, real usdcReceived).
    // A settlement failure must never flow into the outer catch below,
    // which would relabel this genuinely successful swap as FAILED.
    try {
      await settle(orderId);
    } catch (settleErr) {
      console.error(
        `[FlowerSwap] ${orderId} — swap succeeded (tx: ${receipt.hash}) but settlement failed: ${settleErr.message}. ` +
        `Order left at SETTLING for retry — do not treat as a failed swap.`
      );
    }

  } catch (err) {
    console.error(`[FlowerSwap] ${orderId} — swap FAILED:`, err.message);

    await FlowerSwap.updateOne({ _id: swapRecord._id }, { status: "FAILED" });
    await FlowerOrder.updateOne({ orderId }, { status: "FAILED" });
    throw err;
  }
}

export async function processReverseSwap(orderId) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status !== "SWAPPING") {
    console.warn(`[FlowerSwap] ${orderId} status=${order.status} — skipping reverse swap`);
    return;
  }

  const usdcAmount = order.usdcAmountIn;
  if (!usdcAmount || usdcAmount <= 0) throw new Error(`Order ${orderId} has no usdcAmountIn`);

  const provider = new ethers.JsonRpcProvider(RONIN_RPC);
  const signer   = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
  const router   = new ethers.Contract(KATANA_ROUTER, KATANA_ROUTER_ABI, signer);
  const usdc     = new ethers.Contract(RONIN_TOKENS.USDC, ERC20_ABI, signer);

  const amountInWei = ethers.parseUnits(usdcAmount.toString(), 6);
  const path         = [RONIN_TOKENS.USDC, RONIN_TOKENS.FLOWER];
  const deadline      = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS;

  const swapRecord = await FlowerSwap.create({
    orderId, tokenIn: "USDC", tokenOut: "FLOWER",
    amountIn: usdcAmount, dex: "KATANA",
    slippage: 200, status: "PENDING"
  });

  try {
    const readOnlyRouter = new ethers.Contract(KATANA_ROUTER, KATANA_ROUTER_ABI, provider);
    const amounts = await readOnlyRouter.getAmountsOut(amountInWei, path);
    const expectedFlowerOut = amounts[1];
    if (expectedFlowerOut <= 0n) throw new Error("Katana returned zero quote for reverse swap");
    const minOutputRaw = calcMinOutput(expectedFlowerOut);

    const bal = await usdc.balanceOf(signer.address);
    if (bal < amountInWei) {
      throw new Error(`Treasury USDC balance ${ethers.formatUnits(bal, 6)} < ${usdcAmount}`);
    }

    const allowance = await usdc.allowance(signer.address, KATANA_ROUTER);
    if (allowance < amountInWei) {
      const approveTx = await usdc.approve(KATANA_ROUTER, amountInWei);
      await approveTx.wait();
    }

    console.log(`[FlowerSwap] ${orderId} — swapping ${usdcAmount} USDC → FLOWER via Katana`);
    const swapTx = await router.swapExactTokensForTokens(
      amountInWei, minOutputRaw, path, signer.address, deadline
    );

    await recordPendingOperation({
      type: "FLOWER_REVERSE_SWAP",
      chain: "ronin",
      txHash: swapTx.hash,
      referenceId: orderId,
      token: "FLOWER",
    });

    const receipt = await swapTx.wait();

    const flowerReceived = parseFlowerFromReceipt(receipt, RONIN_TOKENS.FLOWER);

    await setPendingOperationAmount({
      chain: "ronin",
      txHash: receipt.hash,
      actualAmount: flowerReceived,
    });

    await FlowerSwap.updateOne({ _id: swapRecord._id },
      { txHash: receipt.hash, amountOut: flowerReceived, status: "COMPLETED" });
    await FlowerOrder.updateOne({ orderId },
      { status: "SWAPPED", swapTxHash: receipt.hash, flowerAmountOut: flowerReceived });

    console.log(`[FlowerSwap] ${orderId} — reverse swap complete: ${flowerReceived} FLOWER (tx: ${receipt.hash})`);

  } catch (err) {
    console.error(`[FlowerSwap] ${orderId} — reverse swap FAILED:`, err.message);
    await FlowerSwap.updateOne({ _id: swapRecord._id }, { status: "FAILED" });
    err.stage = (err?.receipt || err?.transactionHash) ? "post-transfer" : "pre-transfer";
    throw err;
  }
}

function parseFlowerFromReceipt(receipt, flowerAddress) {
  const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
  const flowerLower    = flowerAddress.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === flowerLower && log.topics[0] === TRANSFER_TOPIC) {
      const value = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)[0];
      return parseFloat(ethers.formatUnits(value, 18));
    }
  }
  throw new Error("Could not parse FLOWER amount from swap receipt");
}

// ── Parse USDC amount from Transfer event in swap receipt ────────────────────
function parseUsdcFromReceipt(receipt, usdcAddress) {
  // Transfer(address indexed from, address indexed to, uint256 value)
  const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
  const usdcLower      = usdcAddress.toLowerCase();

  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() === usdcLower &&
      log.topics[0] === TRANSFER_TOPIC
    ) {
      const value = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)[0];
      return parseFloat(ethers.formatUnits(value, 6)); // USDC = 6 decimals
    }
  }

  throw new Error("Could not parse USDC amount from swap receipt");
}

export default { processSwap, processReverseSwap };
