import { sendStablecoinToUser } from './../treasury/treasurySendService.js';
import { receiveStablecoinFromUser } from './../treasury/treasuryReceiveService.js';

import PhpLiquidityPool from '../../models/phpLiquidityPool.js';
import { getUSDPHPRate, getPHPUSDRate } from '../fx/phpRateOracle.js';

import walletService from '../walletService.js';
import Transaction from '../../models/transactionModel.js';

import treasuryService from '../../treasury/treasuryService.js';

async function getPool(currency) {
  const pool = await PhpLiquidityPool.findOne({ currency });
  if (!pool) throw new Error(`${currency} liquidity pool not found`);
  return pool;
}

/**
 * ==========================================================
 * USDC / USDT  --->  PHP
 * ==========================================================
 */
export async function settleStablecoinToPHP({
  userId,
  stablecoinAmount,
  currency = "USDC",
  txRef,
}) {
  const rate = await getUSDPHPRate();
  const phpOut = stablecoinAmount * rate;

  const phpPool = await getPool("PHP");

  if (!phpPool.canFulfill(phpOut)) {
    throw new Error(
      `Insufficient PHP liquidity. Available: ₱${phpPool.available.toFixed(2)}`
    );
  }

  phpPool.reserved += phpOut;
  await phpPool.save();

  try {
    const stableBal = await walletService.getBalance(userId, currency);

    if (stableBal < stablecoinAmount) {
      throw new Error(`Insufficient ${currency} balance`);
    }

    // ── Sweep on-chain FIRST before touching ledger ──────────────
    // If sweep fails (no ETH for gas, address not found, etc.)
    // we abort — PHP is never credited, user keeps USDC in ledger
    try {
      await receiveStablecoinFromUser({
        userId,
        currency,
        amount: stablecoinAmount,
      });
    } catch (sweepErr) {
      console.error(`[swap] On-chain sweep failed — aborting swap:`, sweepErr.message);
      throw new Error(`Swap aborted: could not sweep ${currency} from wallet. ${sweepErr.message}`);
    }

    // Internal ledger debit — only runs if sweep succeeded
    await walletService.debit(userId, currency, stablecoinAmount);

    // Treasury now owns the asset again
    await treasuryService.credit({
      asset: currency,
      amount: stablecoinAmount,
    });

    // Credit PHP
    await walletService.credit(userId, "PHP", phpOut);

    // PHP Pool
    phpPool.balance -= phpOut;
    phpPool.reserved -= phpOut;
    phpPool.totalSwappedIn += stablecoinAmount;
    phpPool.updatedAt = new Date();

    await phpPool.save();

    await Transaction.create({
      referenceId: txRef,
      senderId: userId,
      receiverId: userId,
      senderAddress: "ISCAN",
      receiverAddress: "ISCAN",
      amount: stablecoinAmount,
      currency,
      type: "swap",
      status: "settled",
      metadata: {
        phpOut,
        rate,
        sourceCurrency: currency,
      },
      ledgerGroupId: txRef,
    });

    console.log(
      `[swap] ${stablecoinAmount} ${currency} -> PHP ${phpOut}`
    );

    return {
      phpOut,
      rate,
      txRef,
    };
  } catch (err) {
    phpPool.reserved -= phpOut;
    await phpPool.save();
    throw err;
  }
}

/**
 * ==========================================================
 * PHP ---> USDT / USDC
 * ==========================================================
 */
export async function settlePHPToStablecoin({
  userId,
  phpAmount,
  currency = "USDT",
  txRef,
}) {
  const rate = await getPHPUSDRate();

  const stableOut =
    Math.floor((phpAmount * rate) * 1000000) / 1000000;

  const phpPool = await getPool("PHP");

  const treasuryBalance =
    await treasuryService.getBalance(currency);

  if (treasuryBalance < stableOut) {
    throw new Error(
      `Insufficient ${currency} treasury balance`
    );
  }

  const phpBal = await walletService.getBalance(userId, "PHP");

  if (phpBal < phpAmount) {
    throw new Error("Insufficient PHP balance");
  }

  await walletService.debit(userId, "PHP", phpAmount);

  try {
    // Send blockchain funds
    await sendStablecoinToUser({
      userId,
      amount: stableOut,
      currency,
      txRef,
    });

    // Treasury spent coins
    await treasuryService.debit({
      asset: currency,
      amount: stableOut,
    });

    phpPool.balance += phpAmount;
    phpPool.totalSwappedOut += phpAmount;
    phpPool.updatedAt = new Date();

    await phpPool.save();

    await Transaction.create({
      referenceId: txRef,
      senderId: userId,
      receiverId: userId,
      senderAddress: "ISCAN",
      receiverAddress: "ISCAN",
      amount: phpAmount,
      currency: "PHP",
      type: "swap",
      status: "settled",
      metadata: {
        stableOut,
        rate,
        destinationCurrency: currency,
      },
      ledgerGroupId: txRef,
    });

    console.log(
      `[swap] PHP ${phpAmount} -> ${stableOut} ${currency}`
    );

    return {
      usdtOut: stableOut,
      rate,
      txRef,
    };
  } catch (err) {
    await walletService.credit(userId, "PHP", phpAmount);
    throw err;
  }
}

export async function getPoolStatus() {
  const php = await PhpLiquidityPool.findOne({
    currency: "PHP",
  });

  const usdcTreasury =
    await treasuryService.getBalance("USDC");

  const usdtTreasury =
    await treasuryService.getBalance("USDT");

  const rate = await getUSDPHPRate();

  return {
    PHP: {
      balance: php?.balance || 0,
      reserved: php?.reserved || 0,
      available:
        (php?.balance || 0) - (php?.reserved || 0),
    },

    USDC: {
      balance: usdcTreasury,
      reserved: 0,
      available: usdcTreasury,
    },

    USDT: {
      balance: usdtTreasury,
      reserved: 0,
      available: usdtTreasury,
    },

    rate,
  };
}
