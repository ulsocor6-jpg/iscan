// src/services/flowerSwapServiceBase.js
// Executes FLOWER → USDC swap on Base via Uniswap V3 (FLOWER/USDC 0.3% pool)
// Then calls settle() to convert USDC → PHP and credit user ledger.

import { ethers }  from "ethers";
import FlowerOrder from "../models/flower/flowerOrderModel.js";
import FlowerSwap  from "../models/flower/flowerSwapModel.js";
import { settle }  from "./flower/flowerSettlementService.js";
import inspector  from "./blockchain/inspector/blockchainInspector.js";
import { recordPendingOperation, setPendingOperationAmount } from "./blockchain/pendingOperationService.js";
import { withLock } from "./utils/asyncMutex.js";

// env loaded lazily inside processSwap()
// const USDC_TOKEN   = process.env.BASE_USDC_TOKEN || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
// const BASE_RPC     = process.env.BASE_RPC || 'https://mainnet.base.org';
// const ROUTER       = process.env.BASE_ROUTER || '0x2626664c2603336E57B271c5C0b26F421741e481';
// const FEE_TIER     = 3000; // 0.3% — highest liquidity FLOWER/USDC pool on Base
// const SLIPPAGE_BPS = Number(process.env.BASE_SLIPPAGE_BPS || 200); // 2%

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// Uniswap V3 SwapRouter02 exactInputSingle
const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

export async function processSwap(orderId) {
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

  inspector.info("swap", `Swap starting for ${orderId}`, {
    orderId, userId: String(order.userId), chain: "BASE", step: "swap_start"
  });

  if (!['DEPOSIT_RECEIVED', 'VERIFIED'].includes(order.status)) {
    console.warn(`[FlowerSwapBase] ${orderId} status=${order.status} — skipping`);
    return;
  }

  const updated = await FlowerOrder.findOneAndUpdate(
    { orderId, status: { $in: ['DEPOSIT_RECEIVED', 'VERIFIED'] } },
    { status: 'SWAPPING' },
    { new: true }
  );
  if (!updated) { console.warn(`[FlowerSwapBase] ${orderId} already swapping`); return; }

  const receivedAmount = order.receivedAmount;
  if (!receivedAmount || receivedAmount <= 0) throw new Error(`Order ${orderId} has no receivedAmount`);

  const provider  = new ethers.JsonRpcProvider(BASE_RPC);
  const signer    = new ethers.Wallet(BASE_TREASURY_PRIVATE_KEY, provider);
  const decimals  = 18; // FLOWER is 18 decimals
  const amountIn  = ethers.parseUnits(receivedAmount.toString(), decimals);

  const swapRecord = await FlowerSwap.create({
    orderId, tokenIn: 'FLOWER', tokenOut: 'USDC',
    amountIn: receivedAmount, dex: 'UNISWAP_V3_BASE',
    chain: 'BASE', slippage: SLIPPAGE_BPS, status: 'PENDING'
  });

  try {
    // Serialize the check->approve->execute sequence per chain's treasury
    // wallet. Without this, two orders' balance checks can both pass
    // against the same pooled balance, then race to spend it — the loser
    // fails with a misleading "Treasury FLOWER balance X < Y" error even
    // though its own swept tokens genuinely arrived (see order
    // c12c73c1's stuck-funds case). Locking the whole sequence, not just
    // the check, ensures no other order can drain the balance between
    // "check passed" and "swap executed."
    const receipt = await withLock("flower:BASE", async () => {
      // 1. Check treasury has the FLOWER
      const flowerContract = new ethers.Contract(FLOWER_TOKEN, ERC20_ABI, signer);
      const bal = await flowerContract.balanceOf(signer.address);
      if (bal < amountIn) throw new Error(`Treasury FLOWER balance ${ethers.formatUnits(bal,18)} < ${receivedAmount}`);

      // 2. Approve router if needed
      const allowance = await flowerContract.allowance(signer.address, ROUTER);
      if (allowance < amountIn) {
        console.log(`[FlowerSwapBase] ${orderId} — approving router`);
        const approveTx = await flowerContract.approve(ROUTER, amountIn);
        await approveTx.wait();
        console.log(`[FlowerSwapBase] ${orderId} — approved`);
      }

      // 3. Execute swap — amountOutMinimum = 0 with slippage guard via deadline
      // Using 0 for amountOutMinimum is safe here because:
      // a) we verify treasury holds the tokens
      // b) the pool has $261K TVL, 104 FLOWER (~$7) won't move price significantly
      // Set to non-zero for production with large amounts
      const router   = new ethers.Contract(ROUTER, ROUTER_ABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min

      // Calculate minimum output with slippage
      // Get approximate price: FLOWER ~$0.072, so 1 FLOWER ≈ 0.072 USDC
      // Use on-chain price if available, else use conservative floor
      const approxUsdcOut = receivedAmount * 0.06; // conservative: $0.06/FLOWER floor
      const amountOutMin  = ethers.parseUnits(
        (approxUsdcOut * (1 - SLIPPAGE_BPS / 10000)).toFixed(6), 6
      );

      console.log(`[FlowerSwapBase] ${orderId} — swapping ${receivedAmount} FLOWER → USDC via UniV3`);
      const tx = await router.exactInputSingle({
        tokenIn:              FLOWER_TOKEN,
        tokenOut:             USDC_TOKEN,
        fee:                  FEE_TIER,
        recipient:            signer.address,
        amountIn,
        amountOutMinimum:     amountOutMin,
        sqrtPriceLimitX96:    0n
      });

      console.log(`[FlowerSwapBase] ${orderId} — tx sent: ${tx.hash}`);
      return await tx.wait();
    });

    // 4. Parse USDC received from Transfer event
    const usdcReceived = parseTokenFromReceipt(receipt, USDC_TOKEN, 6);
    console.log(`[FlowerSwapBase] ${orderId} — received ${usdcReceived} USDC (tx: ${receipt.hash})`);

    await FlowerSwap.updateOne({ _id: swapRecord._id },
      { txHash: receipt.hash, amountOut: usdcReceived, status: 'COMPLETED' });
    await FlowerOrder.updateOne({ orderId },
      { status: 'SWAPPED', swapTxHash: receipt.hash, usdcReceived });

    inspector.success("swap", `Swap complete for ${orderId}`, {
      orderId, userId: String(order.userId), chain: "BASE", step: "swap_complete",
      txHash: receipt.hash, usdcReceived
    });

    // 5. Settle: USDC → PHP → ledger credit
    try {
      await settle(orderId);
      inspector.success("swap", `Settlement complete for ${orderId}`, { orderId, userId: String(order.userId), chain: "BASE", step: "settle_complete" });
    } catch (settleErr) {
      console.error(`[FlowerSwapBase] ${orderId} — swap succeeded but settlement failed: ${settleErr.message}. Order left at SWAPPED for retry.`);
      inspector.error("swap", `Settlement failed for ${orderId} (swap succeeded): ${settleErr.message}`, { orderId, userId: String(order.userId), chain: "BASE", step: "settle_failure" });
    }

  } catch (err) {
    console.error(`[FlowerSwapBase] ${orderId} — FAILED:`, err.message);
    inspector.error("swap", `Swap failed for ${orderId}: ${err.message}`, {
      orderId, userId: String(order.userId), chain: "BASE", step: "swap_failure"
    });
    await FlowerSwap.updateOne({ _id: swapRecord._id }, { status: 'FAILED' });
    await FlowerOrder.updateOne({ orderId }, { status: 'FAILED', failureReason: err.message });
    throw err;
  }
}

export async function processReverseSwap(orderId) {
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

  inspector.info("swap", `Reverse swap starting for ${orderId}`, {
    orderId, userId: String(order.userId), chain: "BASE", direction: "USDC_TO_FLOWER", step: "reverse_swap_start"
  });

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
    inspector.info("swap", `Checking treasury USDC balance for ${orderId}`, {
      orderId, chain: "BASE", step: "treasury_balance_check"
    });
    const bal = await usdcContract.balanceOf(signer.address);
    if (bal < amountIn) {
      throw new Error(`Treasury USDC balance ${ethers.formatUnits(bal, 6)} < ${usdcAmount}`);
    }
    inspector.success("swap", `Treasury has sufficient USDC for ${orderId}`, {
      orderId, chain: "BASE", step: "treasury_balance_ok",
      treasuryBalance: parseFloat(ethers.formatUnits(bal, 6)), required: usdcAmount
    });

    const allowance = await usdcContract.allowance(signer.address, ROUTER);
    if (allowance < amountIn) {
      inspector.info("swap", `Approving router to spend USDC for ${orderId}`, {
        orderId, chain: "BASE", step: "approve_router"
      });
      const approveTx = await usdcContract.approve(ROUTER, amountIn);
      await approveTx.wait();
      inspector.success("swap", `Router approved for ${orderId}`, {
        orderId, chain: "BASE", step: "approve_router_confirmed"
      });
    }

    const { getFlowerUsdtRate } = await import("./flower/flowerUsdtSwapService.js");
    const rate = await getFlowerUsdtRate();
    if (!rate) throw new Error("FLOWER price unavailable — refusing to swap without a slippage reference");
    const approxFlowerOut = usdcAmount / (rate * 1.5); // conservative floor — see note in flower/flowerSwapService.js
    inspector.info("swap", `Quote for ${orderId}: ~${approxFlowerOut.toFixed(4)} FLOWER at rate ${rate}`, {
      orderId, chain: "BASE", step: "quote", rate, approxFlowerOut
    });
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

    inspector.info("swap", `Swap tx broadcast for ${orderId}`, {
      orderId, chain: "BASE", step: "tx_broadcast", txHash: tx.hash
    });

    await recordPendingOperation({
      type: "FLOWER_REVERSE_SWAP",
      chain: "base",
      txHash: tx.hash,
      referenceId: orderId,
      token: "FLOWER",
    });

    const receipt = await tx.wait();

    const flowerReceived = parseTokenFromReceipt(receipt, FLOWER_TOKEN, 18);
    console.log(`[FlowerSwapBase] ${orderId} — received ${flowerReceived} FLOWER (tx: ${receipt.hash})`);
    inspector.success("swap", `Reverse swap confirmed for ${orderId}: ${flowerReceived} FLOWER`, {
      orderId, chain: "BASE", step: "reverse_swap_complete", txHash: receipt.hash, flowerReceived
    });

    await setPendingOperationAmount({
      chain: "base",
      txHash: receipt.hash,
      actualAmount: flowerReceived,
    });

    await FlowerSwap.updateOne({ _id: swapRecord._id },
      { txHash: receipt.hash, amountOut: flowerReceived, status: 'COMPLETED' });
    await FlowerOrder.updateOne({ orderId },
      { status: 'SWAPPED', swapTxHash: receipt.hash, flowerAmountOut: flowerReceived });

  } catch (err) {
    console.error(`[FlowerSwapBase] ${orderId} — reverse swap FAILED:`, err.message);
    inspector.error("swap", `Reverse swap failed for ${orderId}: ${err.message}`, {
      orderId, chain: "BASE", step: "reverse_swap_failure"
    });
    await FlowerSwap.updateOne({ _id: swapRecord._id }, { status: 'FAILED' });
    err.stage = (err?.receipt || err?.transactionHash) ? "post-transfer" : "pre-transfer";
    throw err;
  }
}

function parseTokenFromReceipt(receipt, tokenAddress, decimals) {
  const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
  const addrLower = tokenAddress.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === addrLower && log.topics[0] === TRANSFER_TOPIC) {
      const value = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], log.data)[0];
      return parseFloat(ethers.formatUnits(value, decimals));
    }
  }
  throw new Error(`Could not parse token amount from receipt — check token address ${tokenAddress}`);
}

export default { processSwap, processReverseSwap };
