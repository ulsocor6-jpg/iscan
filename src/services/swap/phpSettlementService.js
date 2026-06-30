import { sendStablecoinToUser } from './../treasury/treasurySendService.js';
import { sweepStablecoinToTreasury } from '../treasury/stablecoinSweepService.js';
import PhpLiquidityPool from '../../models/phpLiquidityPool.js';
import { getUSDPHPRate, getPHPUSDRate } from '../fx/phpRateOracle.js';
import Wallet from '../../models/walletModel.js';
import walletService from '../walletService.js';
import Transaction from '../../models/transactionModel.js';

async function getPool(currency) {
  const pool = await PhpLiquidityPool.findOne({ currency });
  if (!pool) throw new Error(`${currency} liquidity pool not found`);
  return pool;
}

// USDC/USDT → PHP
export async function settleStablecoinToPHP({ userId, stablecoinAmount, currency = 'USDC', txRef, chain = 'base' }) {
  const rate   = await getUSDPHPRate(chain, stablecoinAmount);
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

    // Credit user PHP wallet
    await walletService.credit(userId, "PHP", phpOut);

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
      ledgerGroupId: txRef
    });

    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);

    // Sweep the user's real on-chain stablecoin into treasury now that
    // they've been credited PHP for it. This is the actual on-chain
    // settlement leg — without it, the user's real USDC/USDT just sits
    // in their HD wallet untouched while they've already been paid PHP.
    // Non-fatal if it fails: the user has already been correctly
    // credited, and the sweep can be retried/reconciled separately.
    try {
      const wallet = await Wallet.findOne({ userId });
      if (wallet?.walletIndex !== undefined && wallet?.walletIndex !== null) {
        const sweepResult = await sweepStablecoinToTreasury({
          chain,
          token: currency,
          walletIndex: wallet.walletIndex,
        });
        console.log(`[swap] sweep result for ${userId}:`, sweepResult);
      } else {
        console.error(`[swap] sweep skipped — no walletIndex for ${userId}`);
      }
    } catch (sweepErr) {
      console.error(`[swap] SWEEP FAILED for ${userId} (PHP already credited, needs manual reconciliation):`, sweepErr.message);
    }

    return { phpOut, rate, txRef };

  } catch (err) {
    phpPool.reserved -= phpOut;
    await phpPool.save();
    throw err;
  }
}

// PHP → USDT/USDC
export async function settlePHPToStablecoin({ userId, phpAmount, currency = 'USDT', txRef, chain = 'base' }) {
  // Rough USD size of this swap (no gas adjustment) just to scale the
  // gas cost proportionally — small swaps shouldn't eat a flat gas fee.
  const baseRate = await getPHPUSDRate();
  const roughUsdAmount = phpAmount * baseRate;
  const rate = await getPHPUSDRate(chain, roughUsdAmount);

  // USDC/USDT support only 6 decimal places.
  // Truncate instead of using JS floating-point precision.
  const usdtOut = Math.floor((phpAmount * rate) * 1_000_000) / 1_000_000;

  const phpPool    = await getPool('PHP');
  const stablePool = await getPool(currency);

  if (stablePool.balance < usdtOut)
    throw new Error(`Insufficient ${currency} liquidity. Available: ${stablePool.balance.toFixed(2)}`);

  // Deduct PHP from user
  const phpBal = await walletService.getBalance(userId, "PHP");
  if (phpBal < phpAmount)
    throw new Error('Insufficient PHP balance');

  await walletService.debit(userId, "PHP", phpAmount);

  try {
    // Credit stablecoin to user
    await sendStablecoinToUser({ userId, amount: usdtOut, currency, txRef });

    // Settle pools
    phpPool.balance          += phpAmount;
    phpPool.totalSwappedOut  += phpAmount;
    phpPool.updatedAt         = new Date();
    await phpPool.save();

    stablePool.balance         -= usdtOut;
    stablePool.totalSwappedOut += usdtOut;
    stablePool.updatedAt        = new Date();
    await stablePool.save();

    await Transaction.create({
      referenceId: txRef,
      senderId: userId, receiverId: userId,
      senderAddress: 'ISCAN', receiverAddress: 'ISCAN',
      amount: phpAmount, currency: 'PHP',
      type: 'swap', status: 'settled',
      metadata: { usdtOut, rate, destinationCurrency: currency },
      ledgerGroupId: txRef
    });

    console.log(`[swap] ₱${phpAmount} → ${usdtOut.toFixed(6)} ${currency} for ${userId}`);
    return { usdtOut, rate, txRef };

  } catch (err) {
    await walletService.credit(userId, "PHP", phpAmount);
    throw err;
  }
}

export async function getPoolStatus() {
  const [php, usdt, usdc] = await Promise.all([
    PhpLiquidityPool.findOne({ currency: 'PHP' }),
    PhpLiquidityPool.findOne({ currency: 'USDT' }),
    PhpLiquidityPool.findOne({ currency: 'USDC' }),
  ]);
  const rate = await getUSDPHPRate();
  return {
    PHP:  { balance: php?.balance || 0, reserved: php?.reserved || 0, available: (php?.balance || 0) - (php?.reserved || 0) },
    USDT: { balance: usdt?.balance || 0, reserved: usdt?.reserved || 0, available: (usdt?.balance || 0) - (usdt?.reserved || 0) },
    USDC: { balance: usdc?.balance || 0, reserved: usdc?.reserved || 0, available: (usdc?.balance || 0) - (usdc?.reserved || 0) },
    rate,
  };
}
