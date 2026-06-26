// src/services/swap/phpSettlementService.js — full replacement
import PhpLiquidityPool from '../../models/phpLiquidityPool.js';
import { getUSDPHPRate, getPHPUSDRate } from '../fx/phpRateOracle.js';
import walletService from '../walletService.js';
import Transaction from '../../models/transactionModel.js';
import { sendStablecoinToUser } from '../treasury/treasurySendService.js';

async function getPool(currency) {
  const pool = await PhpLiquidityPool.findOne({ currency });
  if (!pool) throw new Error(`${currency} liquidity pool not found`);
  return pool;
}

// ── USDC/USDT → PHP ──────────────────────────────────────────────────────────
// User sends stablecoin from their ledger balance → receives PHP in ledger.
// No on-chain send needed here — user already has the stablecoin on-chain;
// we just convert the internal balance.
export async function settleStablecoinToPHP({ userId, stablecoinAmount, currency = 'USDC', txRef }) {
  const rate   = await getUSDPHPRate();
  const phpOut = stablecoinAmount * rate;

  const phpPool    = await getPool('PHP');
  const stablePool = await getPool(currency);

  if (!phpPool.canFulfill(phpOut))
    throw new Error(`Insufficient PHP liquidity. Available: ₱${phpPool.available.toFixed(2)}`);

  if (stablePool.balance < stablecoinAmount)
    throw new Error(`Insufficient ${currency} in pool`);

  // Lock PHP reserve
  phpPool.reserved += phpOut;
  await phpPool.save();

  try {
    const stableBal = await walletService.getBalance(userId, currency);
    if (stableBal < stablecoinAmount)
      throw new Error(`Insufficient ${currency} balance`);

    await walletService.debit(userId, currency, stablecoinAmount);
    await walletService.credit(userId, 'PHP', phpOut);

    // Settle pools
    phpPool.balance        -= phpOut;
    phpPool.reserved       -= phpOut;
    phpPool.totalSwappedIn += stablecoinAmount;
    phpPool.updatedAt       = new Date();
    await phpPool.save();

    stablePool.balance        += stablecoinAmount;
    stablePool.totalSwappedIn += stablecoinAmount;
    stablePool.updatedAt       = new Date();
    await stablePool.save();

    await Transaction.create({
      referenceId: txRef,
      senderId: userId, receiverId: userId,
      senderAddress: 'ISCAN', receiverAddress: 'ISCAN',
      amount: stablecoinAmount, currency,
      type: 'swap', status: 'settled',
      metadata: { phpOut, rate, sourceCurrency: currency },
      ledgerGroupId: txRef,
    });

    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);
    return { phpOut, rate, txRef };

  } catch (err) {
    phpPool.reserved -= phpOut;
    await phpPool.save();
    throw err;
  }
}

// ── PHP → USDT/USDC ──────────────────────────────────────────────────────────
// 1. Debit PHP from ledger
// 2. Credit USDT/USDC to ledger
// 3. Send real USDT/USDC on-chain from BASE_TREASURY_WALLET → user's Base address
export async function settlePHPToStablecoin({ userId, phpAmount, currency = 'USDT', txRef }) {
  const rate    = await getPHPUSDRate();
  const usdtOut = phpAmount * rate;

  const phpPool    = await getPool('PHP');
  const stablePool = await getPool(currency);

  if (stablePool.balance < usdtOut)
    throw new Error(`Insufficient ${currency} liquidity. Available: ${stablePool.balance.toFixed(2)}`);

  const phpBal = await walletService.getBalance(userId, 'PHP');
  if (phpBal < phpAmount)
    throw new Error('Insufficient PHP balance');

  // ── Step 1: Debit PHP ────────────────────────────────────────────────────
  await walletService.debit(userId, 'PHP', phpAmount);

  try {
    // ── Step 2: Credit stablecoin to ledger ─────────────────────────────
    await walletService.credit(userId, currency, usdtOut, {
      referenceId:     txRef,
      description:     `PHP → ${currency} swap`,
      transactionType: 'swap_credit',
    });

    // ── Step 3: Settle pools ─────────────────────────────────────────────
    phpPool.balance         += phpAmount;
    phpPool.totalSwappedOut += phpAmount;
    phpPool.updatedAt        = new Date();
    await phpPool.save();

    stablePool.balance         -= usdtOut;
    stablePool.totalSwappedOut += usdtOut;
    stablePool.updatedAt        = new Date();
    await stablePool.save();

    // ── Step 4: Send real stablecoin on-chain from treasury ──────────────
    let onChain = null;
    try {
      onChain = await sendStablecoinToUser({
        userId,
        currency,
        amount: usdtOut,
        txRef,
      });
      console.log(`[swap] On-chain send complete: ${onChain.txHash}`);
    } catch (sendErr) {
      // Log but don't roll back ledger — treasury team can manually send
      // if on-chain send fails (e.g. gas issue). User still has ledger credit.
      console.error(`[swap] ⚠️ On-chain send failed for ${txRef}:`, sendErr.message);
      console.error(`[swap] ⚠️ Manual send required: ${usdtOut} ${currency} → user ${userId}`);
    }

    await Transaction.create({
      referenceId: txRef,
      senderId: userId, receiverId: userId,
      senderAddress: 'ISCAN',
      receiverAddress: onChain?.toAddress || 'ISCAN',
      amount: phpAmount, currency: 'PHP',
      type: 'swap', status: onChain ? 'settled' : 'pending_send',
      metadata: {
        usdtOut, rate,
        destinationCurrency: currency,
        onChainTxHash:  onChain?.txHash  || null,
        toAddress:      onChain?.toAddress || null,
        sendError:      onChain ? null : 'on-chain send failed — manual required',
      },
      ledgerGroupId: txRef,
    });

    console.log(`[swap] ₱${phpAmount} → ${usdtOut.toFixed(6)} ${currency} for ${userId}`);
    return {
      usdtOut,
      rate,
      txRef,
      txHash:    onChain?.txHash    || null,
      toAddress: onChain?.toAddress || null,
    };

  } catch (err) {
    // Roll back PHP debit
    await walletService.credit(userId, 'PHP', phpAmount, {
      referenceId:     txRef + '-ROLLBACK',
      description:     'PHP swap rollback',
      transactionType: 'rollback',
    });
    throw err;
  }
}

export async function getPoolStatus() {
  const [php, usdt, usdc] = await Promise.all([
    PhpLiquidityPool.findOne({ currency: 'PHP'  }),
    PhpLiquidityPool.findOne({ currency: 'USDT' }),
    PhpLiquidityPool.findOne({ currency: 'USDC' }),
  ]);
  const rate = await getUSDPHPRate();
  return {
    PHP:  { balance: php?.balance  || 0, reserved: php?.reserved  || 0, available: (php?.balance  || 0) - (php?.reserved  || 0) },
    USDT: { balance: usdt?.balance || 0, reserved: usdt?.reserved || 0, available: (usdt?.balance || 0) - (usdt?.reserved || 0) },
    USDC: { balance: usdc?.balance || 0, reserved: usdc?.reserved || 0, available: (usdc?.balance || 0) - (usdc?.reserved || 0) },
    rate,
  };
}
