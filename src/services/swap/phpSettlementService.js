import { sendStablecoinToUser } from './../treasury/treasurySendService.js';
import { sweepStablecoinToTreasury } from '../treasury/stablecoinSweepService.js';
import { getTokenBalance } from '../onchainBalanceService.js';
import PhpLiquidityPool from '../../models/phpLiquidityPool.js';
import { getUSDPHPRate, getPHPUSDRate } from '../fx/phpRateOracle.js';
import Wallet from '../../models/walletModel.js';
import walletService from '../walletService.js';
import Transaction from '../../models/transactionModel.js';
import inspector from '../blockchain/inspector/blockchainInspector.js';
import inspectorService from '../inspectorService.js';

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
        inspector.warn("php-settlement", `On-chain balance fetch failed for ${w.chainKey} ${currency}: ${err.message}`, {
          chain: w.chainKey,
          currency,
          step: "pool-reconcile",
        });
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
    inspector.info("php-settlement", `Reconciling ${currency} pool: ledger=${pool.balance} -> onChain=${onChainTotal}`, {
      currency,
      ledgerBalance: pool.balance,
      onChainBalance: onChainTotal,
      step: "pool-reconcile",
    });
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

  // flowId reuses txRef (already shared with FeeRecord/Transaction on this
  // same swap) so Swap Inspector, reasoningEngine, and rootCauseClassifier
  // all key off the one id an operator already sees elsewhere, instead of
  // a second parallel "INS-..." id for the same swap attempt.
  await inspectorService.startFlow({
    flowId: txRef,
    pipeline: "STABLECOIN_TO_PHP",
    source: "PHP_SWAP",
    transactionType: "swap",
    referenceId: txRef,
    amount: stablecoinAmount,
    currency,
  });

  const rate   = await getUSDPHPRate(chain, stablecoinAmount);
  const phpOut = stablecoinAmount * rate;

  const phpPool    = await getPool('PHP');
  const stablePool = await getPool(currency);

  if (!phpPool.canFulfill(phpOut))
    throw new Error(`Insufficient PHP liquidity. Available: ₱${phpPool.available.toFixed(2)}`);

  // NOTE: no stablePool.balance pre-check here on purpose. In this
  // direction (Crypto -> PHP) the user's stablecoin is INCOMING — it
  // gets swept into treasury later in this function (SWEEP /
  // SWEEP_CONFIRM), and stablePool.balance is only credited with
  // += stablecoinAmount after that sweep confirms. Requiring the pool
  // to already hold that balance before the sweep happens blocked
  // legitimate swaps whenever on-chain treasury stablecoin was
  // temporarily low, unrelated to this swap's own ability to succeed.
  // The only balance that legitimately gates this direction is PHP
  // liquidity, checked above via phpPool.canFulfill(phpOut).

  // Lock PHP reserve
  phpPool.reserved += phpOut;
  await phpPool.save();

  try {
    await inspectorService.startStage(txRef, "BALANCE_CHECK", { userId, currency, chain, claimedAmount: stablecoinAmount });

    // No internal-ledger pre-check here on purpose. The only balance that
    // matters for a real crypto sweep is what's actually on-chain — the
    // check right below this does that. An internal ledger figure can be
    // stale or simply never populated for a user who funded their address
    // directly, and gating on it here blocked real, fully-backed swaps
    // (e.g. a user with 0.91 USDC on-chain but a near-zero internal
    // ledger number was refused before the on-chain check ever ran).
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      const err = new Error(`No wallet found for user ${userId}`);
      await inspectorService.failStage(txRef, "BALANCE_CHECK", err.message);
      throw err;
    }
    const chainEntry = wallet.chainAddresses?.find(
      c => c.chain?.toLowerCase() === chain.toLowerCase()
    );
    if (!chainEntry?.address) {
      const err = new Error(`No ${chain} address on file for user ${userId}`);
      await inspectorService.failStage(txRef, "BALANCE_CHECK", err.message);
      throw err;
    }
    const onChainBalance = await getTokenBalance(chain.toUpperCase(), chainEntry.address, currency);
    if (onChainBalance === null) {
      const err = new Error(`${currency} not supported on ${chain} — cannot verify on-chain balance`);
      await inspectorService.failStage(txRef, "BALANCE_CHECK", err.message);
      throw err;
    }
    if (onChainBalance < stablecoinAmount) {
      inspector.error("php-settlement", `On-chain balance mismatch for user ${userId}: has ${onChainBalance} ${currency}, claims ${stablecoinAmount}`, {
        orderId: txRef,
        userId, currency, chain,
        onChainBalance, claimedAmount: stablecoinAmount,
        step: "balance-check",
      });
      const err = new Error(
        `On-chain balance mismatch for user ${userId}: has ${onChainBalance} ${currency} on-chain, claims ${stablecoinAmount}. Refusing to credit PHP against unbacked balance.`
      );
      await inspectorService.failStage(txRef, "BALANCE_CHECK", err.message, { output: { onChainBalance, claimedAmount: stablecoinAmount } });
      throw err;
    }

    await inspectorService.finishStage(txRef, "BALANCE_CHECK", { output: { onChainBalance } });

    // Sweep FIRST. PHP must never be ledger-credited until the user's
    // real stablecoin has actually landed in treasury on-chain. This used
    // to run after crediting PHP and was "non-fatal if it fails," which
    // let PHP get paid out against stablecoin that was never actually
    // collected (e.g. Ronin sweeps silently no-op'ing on a bad chain
    // default). Now: no confirmed sweep => no PHP, nothing settled.
    await inspectorService.startStage(txRef, "SWEEP", { chain, currency, amount: stablecoinAmount });

    if (wallet.walletIndex === undefined || wallet.walletIndex === null) {
      const err = new Error(`No walletIndex on file for user ${userId} — cannot sweep`);
      await inspectorService.failStage(txRef, "SWEEP", err.message);
      throw err;
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
      inspector.error("php-settlement", `Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`, {
        orderId: txRef, userId, chain, currency, amount: stablecoinAmount, step: "sweep",
      });
      const err = new Error(`Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`);
      await inspectorService.failStage(txRef, "SWEEP", err.message);
      throw err;
    }

    await inspectorService.finishStage(txRef, "SWEEP", { output: { txHash: sweepResult?.txHash, swept: sweepResult?.swept } });
    await inspectorService.startStage(txRef, "SWEEP_CONFIRM", { expected: stablecoinAmount });

    if (!sweepResult?.txHash || sweepResult.swept < stablecoinAmount) {
      inspector.error("php-settlement", `Sweep did not confirm expected amount for ${userId} on ${chain}: swept ${sweepResult?.swept ?? 0}, expected ${stablecoinAmount}`, {
        orderId: txRef, userId, chain, currency,
        swept: sweepResult?.swept ?? 0, expected: stablecoinAmount,
        step: "sweep-confirm",
      });
      const err = new Error(
        `Sweep did not confirm expected amount for ${userId} on ${chain}: swept ${sweepResult?.swept ?? 0}, expected ${stablecoinAmount}. Refusing to credit PHP.`
      );
      await inspectorService.failStage(txRef, "SWEEP_CONFIRM", err.message, { output: { swept: sweepResult?.swept ?? 0, expected: stablecoinAmount } });
      throw err;
    }

    inspector.success("php-settlement", `Sweep confirmed for ${userId}`, {
      orderId: txRef, userId, chain, currency,
      swept: sweepResult.swept, txHash: sweepResult.txHash,
      step: "sweep-confirm",
    });
    await inspectorService.finishStage(txRef, "SWEEP_CONFIRM", { output: { txHash: sweepResult.txHash } });
    console.log(`[swap] sweep confirmed for ${userId}:`, sweepResult);

    await inspectorService.startStage(txRef, "SETTLE", { phpOut, rate });

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

    inspector.success("php-settlement", `${stablecoinAmount} ${currency} -> PHP ${phpOut.toFixed(2)} settled for ${userId}`, {
      orderId: txRef, userId, currency, stablecoinAmount, phpOut, rate,
      step: "settled",
    });
    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);

    await inspectorService.finishStage(txRef, "SETTLE", { output: { phpOut } });
    await inspectorService.finishFlow(txRef);

    return { phpOut, rate, txRef, sweepTxHash: sweepResult.txHash };

  } catch (err) {
    phpPool.reserved -= phpOut;
    await phpPool.save();
    throw err;
  }
}

// PHP → USDT/USDC
export async function settlePHPToStablecoin({ userId, phpAmount, currency = 'USDT', txRef, chain = 'base' }) {
  await inspectorService.startFlow({
    flowId: txRef,
    pipeline: "PHP_TO_STABLECOIN",
    source: "PHP_SWAP",
    transactionType: "swap",
    referenceId: txRef,
    amount: phpAmount,
    currency: "PHP",
  });

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

  await inspectorService.startStage(txRef, "DEBIT", { phpAmount, currency, usdtOut });

  if (stablePool.balance < usdtOut) {
    const err = new Error(`Insufficient ${currency} liquidity. Available: ${stablePool.balance.toFixed(2)}`);
    await inspectorService.failStage(txRef, "DEBIT", err.message);
    throw err;
  }

  // Deduct PHP from user
  const phpBal = await walletService.getBalance(userId, "PHP");
  if (phpBal < phpAmount) {
    const err = new Error('Insufficient PHP balance');
    await inspectorService.failStage(txRef, "DEBIT", err.message, { output: { phpBal, phpAmount } });
    throw err;
  }

  await walletService.debit(userId, "PHP", phpAmount);
  await inspectorService.finishStage(txRef, "DEBIT", { output: { phpBal, phpAmount } });

  try {
    await inspectorService.startStage(txRef, "SEND", { currency, usdtOut, chain });

    // Credit stablecoin to user
    const sendResult = await sendStablecoinToUser({ userId, amount: usdtOut, currency, txRef });

    await inspectorService.finishStage(txRef, "SEND", { output: { txHash: sendResult?.txHash, toAddress: sendResult?.toAddress } });
    await inspectorService.startStage(txRef, "SETTLE", { phpAmount, usdtOut });

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

    inspector.success("php-settlement", `PHP ${phpAmount} -> ${usdtOut.toFixed(6)} ${currency} settled for ${userId}`, {
      orderId: txRef, userId, currency, phpAmount, usdtOut, rate,
      step: "settled",
    });
    console.log(`[swap] ₱${phpAmount} → ${usdtOut.toFixed(6)} ${currency} for ${userId}`);

    await inspectorService.finishStage(txRef, "SETTLE", { output: { usdtOut } });
    await inspectorService.finishFlow(txRef);

    return { usdtOut, rate, txRef };

  } catch (err) {
    // SEND is the risky stage here — if sendStablecoinToUser threw AFTER
    // broadcasting a tx (e.g. timeout waiting for confirmation, not a
    // real failure to send), blindly refunding PHP here could double-pay
    // the user once the original send confirms late. failStage records
    // the real error either way; only refund if SEND never produced a
    // txHash we'd be refunding against.
    const flow = await inspectorService.getFlow(txRef);
    const sendStage = flow?.stages?.find(s => s.name === "SEND");
    if (!sendStage?.output?.txHash) {
      await inspectorService.failStage(txRef, sendStage?.status === "RUNNING" ? "SEND" : "DEBIT", err.message);
      await walletService.credit(userId, "PHP", phpAmount);
    } else {
      await inspectorService.failStage(txRef, "SETTLE", err.message);
    }
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
