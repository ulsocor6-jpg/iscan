import { sendStablecoinToUser } from './../treasury/treasurySendService.js';
import { sweepStablecoinToTreasury } from '../treasury/stablecoinSweepService.js';
import { getTokenBalance } from '../onchainBalanceService.js';
import PhpLiquidityPool from '../../models/phpLiquidityPool.js';
import { getUSDPHPRate, getPHPUSDRate } from '../fx/phpRateOracle.js';
import Wallet from '../../models/walletModel.js';
import walletService from '../walletService.js';
import Transaction from '../../models/transactionModel.js';

// Treasury wallets checked for real-time on-chain reconciliation. PHP has
// no on-chain equivalent and is intentionally excluded — its pool is
// ledger-only, same as before.
const CHAIN_WALLETS = [
  { chainKey: "BASE",  address: process.env.BASE_TREASURY_WALLET },
  { chainKey: "RONIN", address: process.env.RONIN_TREASURY_WALLET || process.env.TREASURY_WALLET },
].filter(w => w.address);

async function getOnChainPoolTotal(currency) {
  if (currency === "PHP") return null;

  const results = await Promise.all(
    CHAIN_WALLETS.map(async (w) => {
      try {
        const bal = await getTokenBalance(w.chainKey, w.address, currency);
        return typeof bal === "number" ? bal : 0;
      } catch (err) {
        console.error(
          `[phpSettlementService] on-chain balance fetch failed for ${w.chainKey} ${currency}:`,
          err.message
        );
        return 0;
      }
    })
  );

  return results.reduce((sum, bal) => sum + bal, 0);
}

async function getPool(currency) {
  const pool = await PhpLiquidityPool.findOne({ currency });
  if (!pool) throw new Error(`${currency} liquidity pool not found`);

  // Real-time reconciliation: sync the pool's balance to the live
  // on-chain total before any caller uses it for a liquidity check. This
  // closes the exact gap that caused "Insufficient liquidity" errors
  // despite real funds sitting in treasury \u2014 the ledger balance only
  // ever changed via explicit credit/debit calls, never re-synced to
  // on-chain reality on its own.
  const onChainTotal = await getOnChainPoolTotal(currency);
  if (onChainTotal !== null && onChainTotal !== pool.balance) {
    console.log(
      `[phpSettlementService] reconciling ${currency} pool: ledger=${pool.balance} -> onChain=${onChainTotal}`
    );
    pool.balance = onChainTotal;
    pool.updatedAt = new Date();
    await pool.save();
  }

  return pool;
}

// USDC/USDT → PHP
export async function settleStablecoinToPHP({ userId, stablecoinAmount, currency = 'USDC', txRef, chain }) {
  if (!chain) {
    throw new Error('chain is required for stablecoin swaps (base|ronin) — refusing to guess where the user\'s balance lives');
  }

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
    // No internal-ledger pre-check here on purpose. The only balance that
    // matters for a real crypto sweep is what's actually on-chain — the
    // check right below this does that. An internal ledger figure can be
    // stale or simply never populated for a user who funded their address
    // directly, and gating on it here blocked real, fully-backed swaps
    // (e.g. a user with 0.91 USDC on-chain but a near-zero internal
    // ledger number was refused before the on-chain check ever ran).
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) throw new Error(`No wallet found for user ${userId}`);
    const chainEntry = wallet.chainAddresses?.find(
      c => c.chain?.toLowerCase() === chain.toLowerCase()
    );
    if (!chainEntry?.address) {
      throw new Error(`No ${chain} address on file for user ${userId}`);
    }
    const onChainBalance = await getTokenBalance(chain.toUpperCase(), chainEntry.address, currency);
    if (onChainBalance === null) {
      throw new Error(`${currency} not supported on ${chain} — cannot verify on-chain balance`);
    }
    if (onChainBalance < stablecoinAmount) {
      throw new Error(
        `On-chain balance mismatch for user ${userId}: has ${onChainBalance} ${currency} on-chain, claims ${stablecoinAmount}. Refusing to credit PHP against unbacked balance.`
      );
    }

    // Sweep FIRST. PHP must never be ledger-credited until the user's
    // real stablecoin has actually landed in treasury on-chain. This used
    // to run after crediting PHP and was "non-fatal if it fails," which
    // let PHP get paid out against stablecoin that was never actually
    // collected (e.g. Ronin sweeps silently no-op'ing on a bad chain
    // default). Now: no confirmed sweep => no PHP, nothing settled.
    if (wallet.walletIndex === undefined || wallet.walletIndex === null) {
      throw new Error(`No walletIndex on file for user ${userId} — cannot sweep`);
    }

    let sweepResult;
    try {
      sweepResult = await sweepStablecoinToTreasury({
        chain,
        token: currency,
        walletIndex: wallet.walletIndex,
        amount: stablecoinAmount,
      });
    } catch (sweepErr) {
      throw new Error(`Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`);
    }

    if (!sweepResult?.txHash || sweepResult.swept < stablecoinAmount) {
      throw new Error(
        `Sweep did not confirm expected amount for ${userId} on ${chain}: swept ${sweepResult?.swept ?? 0}, expected ${stablecoinAmount}. Refusing to credit PHP.`
      );
    }

    console.log(`[swap] sweep confirmed for ${userId}:`, sweepResult);

    // Only now that the on-chain sweep is confirmed do we touch ledgers.
    await walletService.debit(userId, currency, stablecoinAmount);
    await walletService.credit(userId, "PHP", phpOut);

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
      metadata: { phpOut, rate, sourceCurrency: currency, sweepTxHash: sweepResult.txHash, sweepChain: chain },
      ledgerGroupId: txRef
    });

    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);

    return { phpOut, rate, txRef, sweepTxHash: sweepResult.txHash };

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
