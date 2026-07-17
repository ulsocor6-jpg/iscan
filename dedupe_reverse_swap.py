#!/usr/bin/env python3
"""
Removes the accidental duplicate processReverseSwap block from the two
files hit by the double-run. Verifies there are exactly 2 back-to-back
copies before touching anything — refuses to guess if the shape doesn't
match exactly what's in the diff you pasted.
"""

def dedupe(filepath, block_text, min_gap_len=4):
    content = open(filepath).read()
    count = content.count(block_text)
    if count != 2:
        print(f"❌ {filepath}: expected block to appear exactly 2 times, found {count}. Not touching this file — paste it back to me.")
        return False

    first = content.find(block_text)
    second = content.find(block_text, first + len(block_text))
    gap = content[first + len(block_text):second]

    if len(gap) > min_gap_len or gap.strip() != "":
        print(f"❌ {filepath}: gap between the two copies isn't just whitespace ({gap!r}). Not touching this file — paste it back to me.")
        return False

    new_content = content[:first] + block_text + content[second + len(block_text):]
    open(filepath, "w").write(new_content)
    print(f"✅ {filepath}: duplicate removed ({count} -> 1)")
    return True


RONIN_BLOCK = '''export async function processReverseSwap(orderId) {
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
}'''

BASE_BLOCK = '''export async function processReverseSwap(orderId) {
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
}'''

r1 = dedupe("src/services/flower/flowerSwapService.js", RONIN_BLOCK)
r2 = dedupe("src/services/flowerSwapServiceBase.js", BASE_BLOCK)

if r1 and r2:
    print("\nBoth files fixed. Now run:")
    print("  node --check src/services/flower/flowerSwapService.js")
    print("  node --check src/services/flowerSwapServiceBase.js")
    print("  git --no-pager diff src/services/flower/flowerSwapService.js src/services/flowerSwapServiceBase.js")
