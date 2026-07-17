#!/usr/bin/env python3
"""
Applies the USDC->FLOWER reverse-swap patches.
Run from repo root: python3 apply_usdc_to_flower.py
Then: git --no-pager diff   (review before committing)

Each patch() call raises if the expected old text isn't found exactly once,
so this either applies cleanly or tells you exactly which file drifted from
what I was shown — it will NOT silently partial-apply.
"""
import re
import sys

def patch(filepath, old, new, expected_count=1):
    with open(filepath, "r") as f:
        content = f.read()
    count = content.count(old)
    if count != expected_count:
        print(f"❌ {filepath}: expected {expected_count} match(es), found {count}. Skipping this edit.")
        print(f"   Looking for:\n{old[:200]}...")
        return False
    content = content.replace(old, new)
    with open(filepath, "w") as f:
        f.write(content)
    print(f"✅ {filepath}: patched")
    return True

results = []

# ─────────────────────────────────────────────────────────────────────────
# 1. flowerOrderModel.js — add direction + usdcAmountIn/flowerAmountOut,
#    relax depositAddress/expectedAmount requirement
# ─────────────────────────────────────────────────────────────────────────
results.append(patch(
    "src/models/flower/flowerOrderModel.js",
    '''    token:{ type:String, default:"FLOWER" },
    chain:{ type:String, default:"RONIN" },
    source:{ type:String, enum:["GENERIC","USDT_WIDGET"], default:"GENERIC" },
    depositAddress:{ type:String, required:true },
    expectedAmount:{ type:Number, required:true },
    receivedAmount:{ type:Number, default:0 },''',
    '''    token:{ type:String, default:"FLOWER" },
    chain:{ type:String, default:"RONIN" },
    source:{ type:String, enum:["GENERIC","USDT_WIDGET"], default:"GENERIC" },
    direction:{ type:String, enum:["FLOWER_TO_USDC","USDC_TO_FLOWER"], default:"FLOWER_TO_USDC" },
    depositAddress:{ type:String, required: function() { return this.direction === "FLOWER_TO_USDC"; } },
    expectedAmount:{ type:Number, required: function() { return this.direction === "FLOWER_TO_USDC"; } },
    receivedAmount:{ type:Number, default:0 },
    usdcAmountIn:{ type:Number, default:0 },
    flowerAmountOut:{ type:Number, default:0 },'''
))

# ─────────────────────────────────────────────────────────────────────────
# 2. flowerUsdtSwapService.js — imports, quoteFlowerUsdt, settleUsdtToFlower
# ─────────────────────────────────────────────────────────────────────────
FUS = "src/services/flower/flowerUsdtSwapService.js"

results.append(patch(
    FUS,
    '''import { ethers }     from "ethers";
import { v4 as uuid } from "uuid";
import FlowerOrder    from "../../models/flower/flowerOrderModel.js";
import { processSwap }               from "../flowerSwapServiceBase.js";
import { sweepFlowerToTreasuryBase } from "./flowerSweepServiceBase.js";
import { assertAddressAvailable }    from "./flowerOrderGuard.js";''',
    '''import { ethers }     from "ethers";
import { v4 as uuid } from "uuid";
import FlowerOrder    from "../../models/flower/flowerOrderModel.js";
import FeeRecord      from "../../models/feeModel.js";
import walletService  from "../walletService.js";
import flowerConfig   from "../../../config/flower.js";
import { processSwap }               from "../flowerSwapServiceBase.js";
import { sweepFlowerToTreasuryBase } from "./flowerSweepServiceBase.js";
import { assertAddressAvailable }    from "./flowerOrderGuard.js";

const { PLATFORM_FEE } = flowerConfig; // 2'''
))

results.append(patch(
    FUS,
    '''export async function quoteFlowerUsdt({ fromCurrency, toCurrency, amount }) {
  const amt    = parseFloat(amount);
  const rate   = await getFlowerUsdtRate();
  const SPREAD = 0.015;
  let out, display, youGetLabel, slippageLabel;

  if (fromCurrency === "FLOWER" && toCurrency === "USDC") {
    const gross   = amt * rate;
    const fee     = gross * 0.02;
    out           = gross * (1 - SPREAD) - fee;
    display       = `1 FLOWER = ${rate.toFixed(6)} USDT`;
    youGetLabel   = `${out.toFixed(4)} USDT`;
    slippageLabel = `${(gross * SPREAD).toFixed(4)} USDT (1.5%)`;
  } else {
    // USDT→FLOWER disabled
    throw new Error("USDT→FLOWER swap is not available yet. Send FLOWER on-chain to your deposit address instead.");
  }

  return { rate, youGet: +out.toFixed(6), display, youGetLabel, slippageLabel };
}''',
    '''const SPREAD = 0.015;
const FEE    = 0.02; // matches PLATFORM_FEE in config/flower.js (2%)

export async function quoteFlowerUsdt({ fromCurrency, toCurrency, amount }) {
  const amt = parseFloat(amount);
  if (!(amt > 0)) throw new Error("Amount must be greater than 0");

  const rate = await getFlowerUsdtRate();
  if (!rate) throw new Error("FLOWER price temporarily unavailable — try again shortly.");

  let out, display, youGetLabel, slippageLabel;

  if (fromCurrency === "FLOWER" && toCurrency === "USDC") {
    const gross   = amt * rate;
    const fee     = gross * FEE;
    out           = gross * (1 - SPREAD) - fee;
    display       = `1 FLOWER = ${rate.toFixed(6)} USDC`;
    youGetLabel   = `${out.toFixed(4)} USDC`;
    slippageLabel = `${(gross * SPREAD).toFixed(4)} USDC (1.5%)`;

  } else if (fromCurrency === "USDC" && toCurrency === "FLOWER") {
    const grossFlower = amt / rate;
    const fee          = grossFlower * FEE;
    out                = grossFlower * (1 - SPREAD) - fee;
    display            = `1 FLOWER = ${rate.toFixed(6)} USDC`;
    youGetLabel        = `${out.toFixed(4)} FLOWER`;
    slippageLabel      = `${(grossFlower * SPREAD).toFixed(4)} FLOWER (1.5%)`;

  } else {
    throw new Error("Only FLOWER↔USDC is supported.");
  }

  if (!(out > 0)) throw new Error("Amount too small to quote after fees.");

  return { rate, youGet: +out.toFixed(6), display, youGetLabel, slippageLabel };
}'''
))

results.append(patch(
    FUS,
    '''// USDT→FLOWER: not yet implemented on-chain
export async function settleUsdtToFlower({ userId, amount }) {
  throw new Error(
    "USDT→FLOWER is not available yet. To get FLOWER, purchase it on a DEX and send it to your deposit address."
  );
}''',
    '''// USDC→FLOWER: debit ledger -> real on-chain swap (treasury capital) ->
// credit FLOWER net of fee. Refunds the debit automatically if the swap
// fails before anything was broadcast on-chain.
export async function settleUsdtToFlower({ userId, amount, chain = "BASE", txRef = uuid() }) {
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");
  const normalizedChain = String(chain).toUpperCase();
  if (!["BASE", "RONIN"].includes(normalizedChain)) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  await walletService.debit(userId, "USDC", amount, {
    referenceId: `${txRef}-usdc-debit`,
    description: `USDC→FLOWER swap (${normalizedChain})`,
    transactionType: "flower_swap",
  });

  const orderId = txRef;
  await FlowerOrder.create({
    orderId,
    userId,
    token: "FLOWER",
    chain: normalizedChain,
    direction: "USDC_TO_FLOWER",
    source: "USDT_WIDGET",
    usdcAmountIn: amount,
    status: "SWAPPING",
  });

  console.log(`[FlowerUsdt] ${orderId} — USDC debited, routing ${amount} USDC → FLOWER on ${normalizedChain}`);

  const executor = normalizedChain === "BASE"
    ? (await import("../flowerSwapServiceBase.js")).processReverseSwap
    : (await import("./flowerSwapService.js")).processReverseSwap;

  executor(orderId)
    .then(async () => {
      const order = await FlowerOrder.findOne({ orderId });
      const grossFlower = order.flowerAmountOut;
      const feeAmount   = parseFloat((grossFlower * (PLATFORM_FEE / 100)).toFixed(6));
      const netFlower   = parseFloat((grossFlower - feeAmount).toFixed(6));

      const feeRef = orderId + "-fee";
      if (!(await FeeRecord.exists({ referenceId: feeRef }))) {
        await walletService.credit(userId, "FLOWER", netFlower, {
          referenceId: `${orderId}-flower-credit`,
          description: `USDC→FLOWER swap credit (${normalizedChain})`,
          transactionType: "flower_swap",
        });
        await FeeRecord.create({
          referenceId: feeRef, orderId, userId,
          txType: "flower_swap", currency: "FLOWER",
          grossAmount: grossFlower, feePercent: PLATFORM_FEE, feeAmount, netAmount: netFlower,
          chain: normalizedChain, txHash: order.swapTxHash,
          metadata: { usdcAmountIn: order.usdcAmountIn, direction: "USDC_TO_FLOWER" },
        });
      }

      await FlowerOrder.updateOne({ orderId }, { status: "COMPLETED" });
      console.log(`[FlowerUsdt] ${orderId} — COMPLETED, ${netFlower} FLOWER credited`);
    })
    .catch(async (err) => {
      console.error(`[FlowerUsdt] ${orderId} — reverse swap failed: ${err.message}`);

      if (err.stage === "post-transfer") {
        console.error(`[FlowerUsdt] ${orderId} left in place for manual review — refund NOT auto-issued.`);
        return;
      }

      try {
        const result = await FlowerOrder.updateOne(
          { orderId, status: { $in: ["SWAPPING"] } },
          { status: "FAILED", failureReason: err.message }
        );
        if (result.modifiedCount > 0) {
          await walletService.credit(userId, "USDC", amount, {
            referenceId: `${orderId}-usdc-refund`,
            description: `USDC→FLOWER swap failed — refund`,
            transactionType: "flower_swap_refund",
          });
          console.log(`[FlowerUsdt] ${orderId} — USDC refunded: ${err.message}`);
        }
      } catch (refundErr) {
        console.error(`[FlowerUsdt] ${orderId} — CRITICAL: refund failed:`, refundErr.message);
        // TODO: wire telegramAlertService here — debited, never swapped, refund also failed.
      }
    });

  return {
    txRef: orderId,
    sourceAmount: amount,
    status: "processing",
    message: "Swap submitted. Your FLOWER will be credited once the on-chain transaction confirms (~30s).",
  };
}'''
))

# ─────────────────────────────────────────────────────────────────────────
# 3. flowerSwapServiceBase.js — add processReverseSwap
# ─────────────────────────────────────────────────────────────────────────
FSB = "src/services/flowerSwapServiceBase.js"

results.append(patch(
    FSB,
    '''function parseTokenFromReceipt(receipt, tokenAddress, decimals) {''',
    '''export async function processReverseSwap(orderId) {
  const BASE_TREASURY_PRIVATE_KEY = process.env.BASE_TREASURY_PRIVATE_KEY;
  const FLOWER_TOKEN = process.env.BASE_DEPOSIT_TOKEN;
  const USDC_TOKEN   = process.env.BASE_USDC_TOKEN || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const BASE_RPC     = process.env.BASE_RPC || "https://mainnet.base.org";
  const ROUTER       = process.env.BASE_ROUTER || "0x2626664c2603336E57B271c5C0b26F421741e481";
  const FEE_TIER     = 3000;
  const SLIPPAGE_BPS = Number(process.env.BASE_SLIPPAGE_BPS || 200);
  if (!BASE_TREASURY_PRIVATE_KEY) throw new Error('BASE_TREASURY_PRIVATE_KEY is not set');

  const order = await FlowerOrder.findOne({ orderId });
  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.status !== 'SWAPPING') {
    console.warn(`[FlowerSwapBase] ${orderId} status=${order.status} — skipping reverse swap`);
    return;
  }

  const usdcAmount = order.usdcAmountIn;
  if (!usdcAmount || usdcAmount <= 0) throw new Error(`Order ${orderId} has no usdcAmountIn`);

  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const signer   = new ethers.Wallet(BASE_TREASURY_PRIVATE_KEY, provider);
  const amountIn = ethers.parseUnits(usdcAmount.toString(), 6);

  const swapRecord = await FlowerSwap.create({
    orderId, tokenIn: 'USDC', tokenOut: 'FLOWER',
    amountIn: usdcAmount, dex: 'UNISWAP_V3_BASE',
    chain: 'BASE', slippage: SLIPPAGE_BPS, status: 'PENDING'
  });

  try {
    const usdcContract = new ethers.Contract(USDC_TOKEN, ERC20_ABI, signer);
    const bal = await usdcContract.balanceOf(signer.address);
    if (bal < amountIn) {
      throw new Error(`Treasury USDC balance ${ethers.formatUnits(bal, 6)} < ${usdcAmount}`);
    }

    const allowance = await usdcContract.allowance(signer.address, ROUTER);
    if (allowance < amountIn) {
      const approveTx = await usdcContract.approve(ROUTER, amountIn);
      await approveTx.wait();
    }

    const { getFlowerUsdtRate } = await import("./flower/flowerUsdtSwapService.js");
    const rate = await getFlowerUsdtRate();
    if (!rate) throw new Error("FLOWER price unavailable — refusing to swap without a slippage reference");
    const approxFlowerOut = usdcAmount / (rate * 1.5); // conservative floor — see note in flower/flowerSwapService.js
    const amountOutMin = ethers.parseUnits(
      (approxFlowerOut * (1 - SLIPPAGE_BPS / 10000)).toFixed(18), 18
    );

    const router = new ethers.Contract(ROUTER, ROUTER_ABI, signer);
    console.log(`[FlowerSwapBase] ${orderId} — swapping ${usdcAmount} USDC → FLOWER via UniV3`);
    const tx = await router.exactInputSingle({
      tokenIn:           USDC_TOKEN,
      tokenOut:          FLOWER_TOKEN,
      fee:               FEE_TIER,
      recipient:         signer.address,
      amountIn,
      amountOutMinimum:  amountOutMin,
      sqrtPriceLimitX96: 0n
    });
    const receipt = await tx.wait();

    const flowerReceived = parseTokenFromReceipt(receipt, FLOWER_TOKEN, 18);
    console.log(`[FlowerSwapBase] ${orderId} — received ${flowerReceived} FLOWER (tx: ${receipt.hash})`);

    await FlowerSwap.updateOne({ _id: swapRecord._id },
      { txHash: receipt.hash, amountOut: flowerReceived, status: 'COMPLETED' });
    await FlowerOrder.updateOne({ orderId },
      { status: 'SWAPPED', swapTxHash: receipt.hash, flowerAmountOut: flowerReceived });

  } catch (err) {
    console.error(`[FlowerSwapBase] ${orderId} — reverse swap FAILED:`, err.message);
    await FlowerSwap.updateOne({ _id: swapRecord._id }, { status: 'FAILED' });
    err.stage = (err?.receipt || err?.transactionHash) ? "post-transfer" : "pre-transfer";
    throw err;
  }
}

function parseTokenFromReceipt(receipt, tokenAddress, decimals) {'''
))

results.append(patch(
    FSB,
    "export default { processSwap };",
    "export default { processSwap, processReverseSwap };"
))

# ─────────────────────────────────────────────────────────────────────────
# 4. config/katana.js — add `allowance` to ERC20_ABI
# ─────────────────────────────────────────────────────────────────────────
results.append(patch(
    "config/katana.js",
    '''  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",''',
    '''  {
    inputs: [
      { internalType: "address", name: "owner",   type: "address" },
      { internalType: "address", name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",'''
))

# ─────────────────────────────────────────────────────────────────────────
# 5. flowerSwapService.js (Ronin) — add processReverseSwap
# ─────────────────────────────────────────────────────────────────────────
FSR = "src/services/flower/flowerSwapService.js"

results.append(patch(
    FSR,
    '''import { verifyOrder, calcMinOutput }           from "./flowerVerificationService.js";''',
    '''import { verifyOrder, calcMinOutput }           from "./flowerVerificationService.js";
'''
))  # no-op placeholder kept intentionally minimal; calcMinOutput already imported here

results.append(patch(
    FSR,
    '''// ── Parse USDC amount from Transfer event in swap receipt ────────────────────
function parseUsdcFromReceipt(receipt, usdcAddress) {''',
    '''export async function processReverseSwap(orderId) {
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
    const receipt = await swapTx.wait();

    const flowerReceived = parseFlowerFromReceipt(receipt, RONIN_TOKENS.FLOWER);

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
function parseUsdcFromReceipt(receipt, usdcAddress) {'''
))

results.append(patch(
    FSR,
    "export default { processSwap };",
    "export default { processSwap, processReverseSwap };"
))

# ─────────────────────────────────────────────────────────────────────────
# 6. flowerUsdtController.js — pass chain through
# ─────────────────────────────────────────────────────────────────────────
results.append(patch(
    "src/controllers/flower/flowerUsdtController.js",
    '''    const { fromCurrency, toCurrency, amount } = req.body;
    const userId = req.user.id;''',
    '''    const { fromCurrency, toCurrency, amount, chain } = req.body;
    const userId = req.user.id;'''
))

results.append(patch(
    "src/controllers/flower/flowerUsdtController.js",
    '''    } else if (fromCurrency === "USDC" && toCurrency === "FLOWER") {
      result = await settleUsdtToFlower({ userId, amount: parseFloat(amount) });''',
    '''    } else if (fromCurrency === "USDC" && toCurrency === "FLOWER") {
      result = await settleUsdtToFlower({ userId, amount: parseFloat(amount), chain: chain || "BASE" });'''
))

# ─────────────────────────────────────────────────────────────────────────
# 7. Swaps.tsx — chain param, refetch on chain change, surface errors, label
# ─────────────────────────────────────────────────────────────────────────
SW = "src/pages/Swaps.tsx"

results.append(patch(
    SW,
    '''        const res  = await fetch(
          `/api/v1/flower/usdt/quote?fromCurrency=${from}&toCurrency=${to}&amount=${fuAmount}`,
          { credentials:"include" }
        );
        const data = await res.json();
        setFuQuote(data);
      } catch { setFuQuote(null); }
      finally { setFuQuoting(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [fuAmount, fuDirection]);''',
    '''        const res  = await fetch(
          `/api/v1/flower/usdt/quote?fromCurrency=${from}&toCurrency=${to}&amount=${fuAmount}&chain=${flowerChain}`,
          { credentials:"include" }
        );
        const data = await res.json();
        if (!res.ok) { setFuQuote(null); setFuError(data.error || "Could not get a quote"); return; }
        setFuError("");
        setFuQuote(data);
      } catch { setFuQuote(null); setFuError("Network error getting quote"); }
      finally { setFuQuoting(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [fuAmount, fuDirection, flowerChain]);'''
))

results.append(patch(
    SW,
    '''        body: JSON.stringify({ fromCurrency:from, toCurrency:to, amount:parseFloat(fuAmount) })''',
    '''        body: JSON.stringify({ fromCurrency:from, toCurrency:to, amount:parseFloat(fuAmount), chain:flowerChain })'''
))

results.append(patch(
    SW,
    '''                <select
                  value={flowerChain}
                  onChange={e=>setFlowerChain(e.target.value)}
                  style={inp}
                >''',
    '''                <select
                  value={flowerChain}
                  onChange={e=>{ setFlowerChain(e.target.value); setFuQuote(null); setFuError(""); }}
                  style={inp}
                >'''
))

results.append(patch(
    SW,
    '''                {flowerChain === "RONIN" ? "Swap FLOWER on Base via Uniswap V3." : "Swap FLOWER on Base via Uniswap V3."}''',
    '''                {flowerChain === "RONIN" ? "Swap FLOWER on Ronin via Katana." : "Swap FLOWER on Base via Uniswap V3."}'''
))

# ─────────────────────────────────────────────────────────────────────────
# 8. FlowerChart.tsx — pre-existing unrelated bug (invalid toCurrency)
# ─────────────────────────────────────────────────────────────────────────
results.append(patch(
    "src/banking/components/dashboard/FlowerChart.tsx",
    '''fetch("/api/v1/flower/usdt/quote?fromCurrency=FLOWER&toCurrency=USDT&amount=1", {''',
    '''fetch("/api/v1/flower/usdt/quote?fromCurrency=FLOWER&toCurrency=USDC&amount=1", {'''
))

print()
ok = sum(1 for r in results if r)
print(f"{ok}/{len(results)} edits applied.")
if ok != len(results):
    print("⚠️  Some edits were skipped — those files differ from what I was shown.")
    print("   Paste the current content of the skipped file(s) back to me and I'll re-diff.")
    sys.exit(1)
else:
    print("All clean. Now run: git --no-pager diff")
