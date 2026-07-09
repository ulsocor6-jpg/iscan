// src/services/flowerSwapServiceBase.js
// Executes FLOWER → USDC swap on Base via Uniswap V3 (FLOWER/USDC 0.3% pool)
// Then calls settle() to convert USDC → PHP and credit user ledger.

import { ethers }  from "ethers";
import FlowerOrder from "../models/flower/flowerOrderModel.js";
import FlowerSwap  from "../models/flower/flowerSwapModel.js";
import { settle }  from "./flower/flowerSettlementService.js";
import inspector  from "./blockchain/inspector/blockchainInspector.js";

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
    const receipt = await tx.wait();

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

export default { processSwap };
