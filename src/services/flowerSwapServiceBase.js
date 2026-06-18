// src/services/flower/flowerSwapServiceBase.js
//
// Executes the FLOWER → USDC swap on Base, routed through whichever of
// Velora (formerly ParaSwap) or Odos returns the better quote for the
// same trade. Mirrors flowerSwapService.js (Ronin/Katana), but Base has
// no single fixed router the way Katana is — each aggregator returns its
// own execution target dynamically per-quote, so there's no equivalent
// of a static KATANA_ROUTER address here.
//
// ⚠️ NEW ENV VAR REQUIRED — not in your original checklist:
//   ODOS_API_KEY   — register at https://docs.odos.xyz/home/api-portal-access
//                    (free tier: 2 req/s, 4,000/day — fine for this volume)
//   VELORA_PARTNER — optional, defaults to "anon" (anon tier carries a 1bps fee;
//                    register a partner string later if you want to avoid it)
//
// ⚠️ ASSUMPTIONS FLAGGED — please verify before relying on this in production:
//   1. verifyOrder() / calcMinOutput() from flowerVerificationService.js are
//      reused as-is. I haven't seen that file, so I don't know whether it's
//      Ronin-specific internally (e.g. hardcodes a Ronin path/decimals) or
//      already chain-aware. If it assumes Ronin, it needs a Base-aware branch
//      before minOutputRaw below is trustworthy.
//   2. FlowerSwap.dex is set here to "PENDING_SELECTION" then "VELORA"/"ODOS".
//      If that field is a restricted enum in your schema (only "KATANA" etc.),
//      this will fail validation — check flowerSwapModel.js.
//   3. The "chain: 'BASE'" field assumes your FlowerSwap schema has (or
//      tolerates) a chain field. If the schema is strict with no such field,
//      this will be silently dropped or throw, depending on your mongoose config.

import { ethers } from "ethers";
import axios from "axios";
import FlowerOrder from "../../models/flowerOrderModel.js";
import FlowerSwap from "../../models/flowerSwapModel.js";
import baseConfig from "../../../config/chains/base.js";
import { verifyOrder } from "./flowerVerificationService.js";
import { settle } from "./flowerSettlementService.js";

const {
  rpcUrl: BASE_RPC,
  treasuryPrivateKey: BASE_TREASURY_PRIVATE_KEY,
  depositTokenAddress: FLOWER_TOKEN_BASE,
  depositTokenDecimals: FLOWER_DECIMALS,
  quoteTokenAddress: USDC_BASE,
  quoteTokenDecimals: USDC_DECIMALS,
  slippageBps: SLIPPAGE_BPS,
  chainIdHex
} = baseConfig;

const CHAIN_ID = Number(chainIdHex); // "0x2105" -> 8453, JS Number() parses 0x-prefixed hex strings natively

const ERC20_APPROVE_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const VELORA_PARTNER = process.env.VELORA_PARTNER || "anon";
const ODOS_API_KEY = process.env.ODOS_API_KEY;

// ── Main entry — called by watcher after VERIFIED ────────────────────────────
export async function processSwap(orderId) {
  const { receivedAmount, minOutputRaw } = await verifyOrder(orderId);

  const updated = await FlowerOrder.findOneAndUpdate(
    { orderId, status: { $in: ["VERIFIED", "DEPOSIT_RECEIVED"] } },
    { status: "SWAPPING" },
    { new: true }
  );
  if (!updated) {
    console.warn(`[FlowerSwapBase] ${orderId} already swapping or past that state — skipping`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const signer   = new ethers.Wallet(BASE_TREASURY_PRIVATE_KEY, provider);
  const amountInRaw = ethers.parseUnits(receivedAmount.toString(), FLOWER_DECIMALS).toString();

  const swapRecord = await FlowerSwap.create({
    orderId,
    tokenIn:  "FLOWER",
    tokenOut: "USDC",
    amountIn: receivedAmount,
    dex:      "PENDING_SELECTION",
    chain:    "BASE",
    slippage: SLIPPAGE_BPS,
    status:   "PENDING"
  });

  try {
    // 1. Get quotes from both aggregators in parallel — one failing doesn't block the other
    const [veloraResult, odosResult] = await Promise.allSettled([
      getVeloraQuote({ amountInRaw, userAddr: signer.address }),
      getOdosQuote({ amountInRaw, userAddr: signer.address })
    ]);

    const candidates = [];
    if (veloraResult.status === "fulfilled" && veloraResult.value) candidates.push(veloraResult.value);
    if (odosResult.status === "fulfilled" && odosResult.value) candidates.push(odosResult.value);

    if (candidates.length === 0) {
      throw new Error("Both Velora and Odos failed to return a usable quote");
    }

    // 2. Pick the higher output. Both quotes are for the same input amount and
    //    the same output token (USDC), so comparing raw output is apples-to-apples.
    //    Not netting out gas cost here — treasury pays gas in ETH separately,
    //    not out of swap proceeds. Easy to add later via each quote's gas estimate.
    candidates.sort((a, b) => (BigInt(b.outputRaw) > BigInt(a.outputRaw) ? 1 : -1));
    const winner = candidates[0];

    console.log(
      `[FlowerSwapBase] ${orderId} — chose ${winner.provider} (output ${winner.outputRaw}); ` +
      `other: ${candidates[1]?.provider ?? "none"} ${candidates[1]?.outputRaw ?? "n/a"}`
    );

    // 3. Slippage floor check against verification service's minOutputRaw
    if (minOutputRaw && BigInt(winner.outputRaw) < BigInt(minOutputRaw)) {
      throw new Error(`Best quote ${winner.outputRaw} is below minOutputRaw ${minOutputRaw} — aborting swap`);
    }

    await FlowerSwap.updateOne({ _id: swapRecord._id }, { dex: winner.provider });

    // 4. Approve the winning aggregator's spender (if needed), then execute
    const flowerToken = new ethers.Contract(FLOWER_TOKEN_BASE, ERC20_APPROVE_ABI, signer);
    const currentAllowance = await flowerToken.allowance(signer.address, winner.spender);
    if (currentAllowance < BigInt(amountInRaw)) {
      console.log(`[FlowerSwapBase] ${orderId} — approving ${winner.provider} spender`);
      const approveTx = await flowerToken.approve(winner.spender, amountInRaw);
      await approveTx.wait();
    }

    console.log(`[FlowerSwapBase] ${orderId} — executing via ${winner.provider}`);
    const sentTx = await signer.sendTransaction({
      to:    winner.to,
      data:  winner.data,
      value: winner.value || 0n
    });
    const receipt = await sentTx.wait();

    const usdcReceived = parseUsdcFromReceipt(receipt, USDC_BASE, USDC_DECIMALS);

    await FlowerSwap.updateOne(
      { _id: swapRecord._id },
      { txHash: receipt.hash, amountOut: usdcReceived, status: "COMPLETED" }
    );
    await FlowerOrder.updateOne(
      { orderId },
      { status: "SWAPPED", swapTxHash: receipt.hash, usdcReceived }
    );

    console.log(`[FlowerSwapBase] ${orderId} — swap complete via ${winner.provider}: ${usdcReceived} USDC (tx: ${receipt.hash})`);

    await settle(orderId);

  } catch (err) {
    console.error(`[FlowerSwapBase] ${orderId} — swap FAILED:`, err.message);
    await FlowerSwap.updateOne({ _id: swapRecord._id }, { status: "FAILED" });
    await FlowerOrder.updateOne({ orderId }, { status: "FAILED" });
    throw err;
  }
}

// ── Velora (Augustus v6.2) quote + calldata in one round-trip via /swap ──────
async function getVeloraQuote({ amountInRaw, userAddr }) {
  try {
    const res = await axios.get("https://api.velora.xyz/swap", {
      params: {
        srcToken: FLOWER_TOKEN_BASE,
        srcDecimals: FLOWER_DECIMALS,
        destToken: USDC_BASE,
        destDecimals: USDC_DECIMALS,
        amount: amountInRaw,
        side: "SELL",
        network: CHAIN_ID,
        slippage: SLIPPAGE_BPS, // already basis points, matches Velora's expected units
        userAddress: userAddr,
        version: "6.2",
        partner: VELORA_PARTNER
      },
      timeout: 8000
    });

    const { priceRoute, txParams } = res.data;
    return {
      provider: "VELORA",
      outputRaw: priceRoute.destAmount,
      spender: txParams.to, // Augustus v6.2 router is both the spender and the call target
      to: txParams.to,
      data: txParams.data,
      value: BigInt(txParams.value || "0")
    };
  } catch (err) {
    console.warn(`[FlowerSwapBase] Velora quote failed: ${err.message}`);
    return null;
  }
}

// ── Odos quote (sor/quote/v3) + assemble (sor/assemble) ──────────────────────
async function getOdosQuote({ amountInRaw, userAddr }) {
  try {
    const quoteRes = await axios.post(
      "https://enterprise-api.odos.xyz/sor/quote/v3",
      {
        chainId: CHAIN_ID,
        inputTokens:  [{ tokenAddress: FLOWER_TOKEN_BASE, amount: amountInRaw }],
        outputTokens: [{ tokenAddress: USDC_BASE, proportion: 1 }],
        userAddr,
        slippageLimitPercent: SLIPPAGE_BPS / 100, // bps -> percent (200 bps -> 2)
        compact: true
      },
      { headers: { "x-api-key": ODOS_API_KEY }, timeout: 8000 }
    );

    const { pathId, outAmounts } = quoteRes.data;

    const assembleRes = await axios.post(
      "https://enterprise-api.odos.xyz/sor/assemble",
      { userAddr, pathId, simulate: true },
      { headers: { "x-api-key": ODOS_API_KEY }, timeout: 8000 }
    );

    const { transaction, simulation } = assembleRes.data;
    if (simulation && simulation.isSuccess === false) {
      console.warn(`[FlowerSwapBase] Odos simulation failed: ${simulation.simulationError}`);
      return null;
    }

    return {
      provider: "ODOS",
      outputRaw: outAmounts[0],
      spender: transaction.to,
      to: transaction.to,
      data: transaction.data,
      value: BigInt(transaction.value || "0")
    };
  } catch (err) {
    console.warn(`[FlowerSwapBase] Odos quote failed: ${err.message}`);
    return null;
  }
}

// ── Parse USDC amount from Transfer event in swap receipt ────────────────────
function parseUsdcFromReceipt(receipt, usdcAddress, usdcDecimals) {
  const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
  const usdcLower = usdcAddress.toLowerCase();

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === usdcLower && log.topics[0] === TRANSFER_TOPIC) {
      const value = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.data)[0];
      return parseFloat(ethers.formatUnits(value, usdcDecimals));
    }
  }

  throw new Error("Could not parse USDC amount from swap receipt");
}

export default { processSwap };
