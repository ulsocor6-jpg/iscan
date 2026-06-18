// src/services/flowerVerificationService.js
// Verifies:
//   1. Received amount matches expected (within tolerance)
//   2. Price quote from Katana is within acceptable slippage range
//   3. Order is in correct state to proceed

import { ethers }                               from "ethers";
import FlowerOrder                              from "../../models/flower/flowerOrderModel.js";
import flowerConfig                             from "../../../config/flower.js";
import { KATANA_ROUTER_ABI, RONIN_TOKENS,
         DEFAULT_SLIPPAGE_BPS }                 from "../../../config/katana.js";

const { RONIN_RPC, KATANA_ROUTER } = flowerConfig;

// ── Get expected USDC output for a given FLOWER input ────────────────────────
export async function getQuote(amountIn) {
  const provider = new ethers.JsonRpcProvider(RONIN_RPC);
  const router   = new ethers.Contract(KATANA_ROUTER, KATANA_ROUTER_ABI, provider);

  // FLOWER → USDC path (direct pair on Katana)
  const path = [RONIN_TOKENS.FLOWER, RONIN_TOKENS.USDC];

  // amountIn needs 18 decimals (FLOWER is 18-decimal ERC20)
  const amountInWei = ethers.parseUnits(amountIn.toString(), 18);

  const amounts    = await router.getAmountsOut(amountInWei, path);
  const amountOut  = amounts[1]; // USDC out (6 decimals)

  return {
    amountInFlower: amountIn,
    amountOutUsdc:  parseFloat(ethers.formatUnits(amountOut, 6)),
    amountOutRaw:   amountOut
  };
}

// ── Calculate minimum acceptable output after slippage ───────────────────────
export function calcMinOutput(amountOutRaw, slippageBps = DEFAULT_SLIPPAGE_BPS) {
  // amountOutRaw is BigInt from ethers
  const slippageFactor = BigInt(10000 - slippageBps);
  return (amountOutRaw * slippageFactor) / 10000n;
}

// ── Full verification gate before swap executes ──────────────────────────────
export async function verifyOrder(orderId) {
  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);

  // 1. State check
  if (!["VERIFIED", "DEPOSIT_RECEIVED"].includes(order.status)) {
    throw new Error(`Order ${orderId} is not in a verifiable state (status: ${order.status})`);
  }

  // 2. Amount check — received must be ≥ 99% of expected
  const receivedAmount  = order.receivedAmount;
  const expectedAmount  = order.expectedAmount;
  const minAcceptable   = expectedAmount * 0.99;

  if (receivedAmount < minAcceptable) {
    throw new Error(
      `Insufficient deposit: expected ${expectedAmount} FLOWER, received ${receivedAmount} FLOWER`
    );
  }

  // 3. Price quote — get live Katana quote for received amount
  const quote = await getQuote(receivedAmount);

  if (quote.amountOutUsdc <= 0) {
    throw new Error(`Katana returned zero quote for ${receivedAmount} FLOWER`);
  }

  // 4. Slippage-adjusted minimum output
  const minOutputRaw = calcMinOutput(quote.amountOutRaw);

  console.log(
    `[FlowerVerification] ${orderId} — ` +
    `${receivedAmount} FLOWER → ~${quote.amountOutUsdc} USDC ` +
    `(min after slippage: ${ethers.formatUnits(minOutputRaw, 6)} USDC)`
  );

  return {
    order,
    receivedAmount,
    quote,
    minOutputRaw
  };
}

export default { getQuote, calcMinOutput, verifyOrder };
