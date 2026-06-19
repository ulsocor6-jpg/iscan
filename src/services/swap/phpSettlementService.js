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
      userId, type: 'SWAP', subType: `${currency}_TO_PHP`,
      amount: stablecoinAmount, currency, phpAmount: phpOut,
      rate, txRef, status: 'COMPLETED',
    });

    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);
    return { phpOut, rate, txRef };

  } catch (err) {
    phpPool.reserved -= phpOut;
    await phpPool.save();
    throw err;
  }
}

// PHP → USDT/USDC
export async function settlePHPToStablecoin({ userId, phpAmount, currency = 'USDT', txRef }) {
  const rate    = await getPHPUSDRate();
  const usdtOut = phpAmount * rate;

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
    await walletService.credit(userId, currency, usdtOut);

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
      userId, type: 'SWAP', subType: `PHP_TO_${currency}`,
      amount: phpAmount, currency: 'PHP', usdtAmount: usdtOut,
      rate, txRef, status: 'COMPLETED',
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
