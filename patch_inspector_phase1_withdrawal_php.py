#!/usr/bin/env python3
"""
Patch: wire withdrawal + PHP settlement pipelines into blockchainInspector.

Run from repo root:  python3 patch_inspector_phase1_withdrawal_php.py
Aborts loudly (no partial writes) if any anchor doesn't match exactly.
Review with: git --no-pager diff
"""
import sys
from pathlib import Path

def patch_file(path, replacements):
    p = Path(path)
    if not p.exists():
        print(f"ABORT: {path} does not exist")
        sys.exit(1)
    text = p.read_text()
    for old, new, label in replacements:
        count = text.count(old)
        if count == 0:
            print(f"ABORT: anchor not found in {path} — {label}")
            print("----- expected anchor -----")
            print(old)
            sys.exit(1)
        if count > 1:
            print(f"ABORT: anchor matched {count} times (expected 1) in {path} — {label}")
            sys.exit(1)
        text = text.replace(old, new)
    p.write_text(text)
    print(f"OK: patched {path}")


# ---------------------------------------------------------------------------
# 1. withdrawalProcessor.js
# ---------------------------------------------------------------------------
WP = "src/services/withdrawalProcessor.js"

patch_file(WP, [
    (
        '''import walletService from "./walletService.js";
import { sendCryptoToAddress } from "./treasury/treasurySendService.js";
import eventStreamService from "./eventStreamService.js";
import { sendTelegramAlert } from "./telegramAlertService.js";''',
        '''import walletService from "./walletService.js";
import { sendCryptoToAddress } from "./treasury/treasurySendService.js";
import eventStreamService from "./eventStreamService.js";
import { sendTelegramAlert } from "./telegramAlertService.js";
import inspector from "./blockchain/inspector/blockchainInspector.js";''',
        "import inspector"
    ),
    (
        '''    withdrawal.status = "failed";
    withdrawal.failReason = debitErr.message;
    await withdrawal.save();
    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: debitErr.message,
      stage: "debit",
    });''',
        '''    withdrawal.status = "failed";
    withdrawal.failReason = debitErr.message;
    await withdrawal.save();
    inspector.error("withdrawal", `Debit failed for WD-${withdrawal._id}: ${debitErr.message}`, {
      orderId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      step: "debit",
    });
    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: debitErr.message,
      stage: "debit",
    });''',
        "inspector.error on debit failure"
    ),
    (
        '''    withdrawal.status = "failed";
    withdrawal.failReason = sendErr.message;
    await withdrawal.save();
    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: sendErr.message,
    });''',
        '''    withdrawal.status = "failed";
    withdrawal.failReason = sendErr.message;
    await withdrawal.save();
    inspector.error("withdrawal", `Send failed for WD-${withdrawal._id}: ${sendErr.message}`, {
      orderId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      step: "send",
    });
    await eventStreamService.emit("withdrawal.failed", {
      entityId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      error: sendErr.message,
    });''',
        "inspector.error on send failure"
    ),
    (
        '''    withdrawal.status = "completed";
    withdrawal.txHash = result.txHash;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();
    await eventStreamService.emit("withdrawal.completed", {''',
        '''    withdrawal.status = "completed";
    withdrawal.txHash = result.txHash;
    withdrawal.approvedAt = new Date();
    await withdrawal.save();
    inspector.success("withdrawal", `WD-${withdrawal._id} settled`, {
      orderId: withdrawal._id.toString(),
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount,
      txHash: result.txHash,
    });
    await eventStreamService.emit("withdrawal.completed", {''',
        "inspector.success on completed withdrawal"
    ),
])


# ---------------------------------------------------------------------------
# 2. cryptoWithdrawalController.js
# ---------------------------------------------------------------------------
CWC = "src/controllers/cryptoWithdrawalController.js"

patch_file(CWC, [
    (
        '''import { estimateNetworkFee } from "../services/treasury/gasEstimationService.js";''',
        '''import { estimateNetworkFee } from "../services/treasury/gasEstimationService.js";
import inspector from "../services/blockchain/inspector/blockchainInspector.js";''',
        "import inspector"
    ),
    (
        '''    if (!feeResult.estimated) {
      console.warn(`[cryptoWithdrawal] live fee estimate failed, using fallback ${networkFee} ${asset} for ${network}`);
    }''',
        '''    if (!feeResult.estimated) {
      inspector.warn("withdrawal", `Live fee estimate failed, using fallback ${networkFee} ${asset} for ${network}`, {
        userId: req.user.id,
        asset, network,
        fallbackFee: networkFee,
        step: "fee-estimate",
      });
    }''',
        "inspector.warn on fee estimate fallback"
    ),
    (
        '''  } catch (err) {
    console.error("[cryptoWithdrawal] error:", err);
    res.status(500).json({ error: err.message });
  }
}
export async function getCryptoWithdrawals(req, res) {''',
        '''  } catch (err) {
    inspector.error("withdrawal", `Withdrawal creation failed: ${err.message}`, {
      userId: req.user?.id,
      step: "create",
    });
    res.status(500).json({ error: err.message });
  }
}
export async function getCryptoWithdrawals(req, res) {''',
        "inspector.error on withdrawal creation failure"
    ),
])


# ---------------------------------------------------------------------------
# 3. phpSettlementService.js
# ---------------------------------------------------------------------------
PSS = "src/services/swap/phpSettlementService.js"

patch_file(PSS, [
    (
        '''import Transaction from '../../models/transactionModel.js';''',
        '''import Transaction from '../../models/transactionModel.js';
import inspector from '../blockchain/inspector/blockchainInspector.js';''',
        "import inspector"
    ),
    (
        '''      } catch (err) {
        console.error(
          `[phpSettlementService] on-chain balance fetch failed for ${w.chainKey} ${currency}:`,
          err.message
        );
        return 0;
      }''',
        '''      } catch (err) {
        inspector.warn("php-settlement", `On-chain balance fetch failed for ${w.chainKey} ${currency}: ${err.message}`, {
          chain: w.chainKey,
          currency,
          step: "pool-reconcile",
        });
        return 0;
      }''',
        "inspector.warn on pool balance fetch failure"
    ),
    (
        '''  if (onChainTotal !== null && onChainTotal !== pool.balance) {
    console.log(
      `[phpSettlementService] reconciling ${currency} pool: ledger=${pool.balance} -> onChain=${onChainTotal}`
    );
    pool.balance = onChainTotal;''',
        '''  if (onChainTotal !== null && onChainTotal !== pool.balance) {
    inspector.info("php-settlement", `Reconciling ${currency} pool: ledger=${pool.balance} -> onChain=${onChainTotal}`, {
      currency,
      ledgerBalance: pool.balance,
      onChainBalance: onChainTotal,
      step: "pool-reconcile",
    });
    pool.balance = onChainTotal;''',
        "inspector.info on pool reconciliation"
    ),
    (
        '''    if (onChainBalance < stablecoinAmount) {
      throw new Error(
        `On-chain balance mismatch for user ${userId}: has ${onChainBalance} ${currency} on-chain, claims ${stablecoinAmount}. Refusing to credit PHP against unbacked balance.`
      );
    }''',
        '''    if (onChainBalance < stablecoinAmount) {
      inspector.error("php-settlement", `On-chain balance mismatch for user ${userId}: has ${onChainBalance} ${currency}, claims ${stablecoinAmount}`, {
        orderId: txRef,
        userId, currency, chain,
        onChainBalance, claimedAmount: stablecoinAmount,
        step: "balance-check",
      });
      throw new Error(
        `On-chain balance mismatch for user ${userId}: has ${onChainBalance} ${currency} on-chain, claims ${stablecoinAmount}. Refusing to credit PHP against unbacked balance.`
      );
    }''',
        "inspector.error on on-chain balance mismatch"
    ),
    (
        '''    } catch (sweepErr) {
      throw new Error(`Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`);
    }
    if (!sweepResult?.txHash || sweepResult.swept < stablecoinAmount) {
      throw new Error(
        `Sweep did not confirm expected amount for ${userId} on ${chain}: swept ${sweepResult?.swept ?? 0}, expected ${stablecoinAmount}. Refusing to credit PHP.`
      );
    }
    console.log(`[swap] sweep confirmed for ${userId}:`, sweepResult);''',
        '''    } catch (sweepErr) {
      inspector.error("php-settlement", `Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`, {
        orderId: txRef, userId, chain, currency, amount: stablecoinAmount, step: "sweep",
      });
      throw new Error(`Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`);
    }
    if (!sweepResult?.txHash || sweepResult.swept < stablecoinAmount) {
      inspector.error("php-settlement", `Sweep did not confirm expected amount for ${userId} on ${chain}: swept ${sweepResult?.swept ?? 0}, expected ${stablecoinAmount}`, {
        orderId: txRef, userId, chain, currency,
        swept: sweepResult?.swept ?? 0, expected: stablecoinAmount,
        step: "sweep-confirm",
      });
      throw new Error(
        `Sweep did not confirm expected amount for ${userId} on ${chain}: swept ${sweepResult?.swept ?? 0}, expected ${stablecoinAmount}. Refusing to credit PHP.`
      );
    }
    inspector.success("php-settlement", `Sweep confirmed for ${userId}`, {
      orderId: txRef, userId, chain, currency,
      swept: sweepResult.swept, txHash: sweepResult.txHash,
      step: "sweep-confirm",
    });
    console.log(`[swap] sweep confirmed for ${userId}:`, sweepResult);''',
        "inspector.error/success on sweep failure/confirmation"
    ),
    (
        '''    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);
    return { phpOut, rate, txRef, sweepTxHash: sweepResult.txHash };''',
        '''    inspector.success("php-settlement", `${stablecoinAmount} ${currency} -> PHP ${phpOut.toFixed(2)} settled for ${userId}`, {
      orderId: txRef, userId, currency, stablecoinAmount, phpOut, rate,
      step: "settled",
    });
    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);
    return { phpOut, rate, txRef, sweepTxHash: sweepResult.txHash };''',
        "inspector.success on stablecoin->PHP settlement"
    ),
    (
        '''    console.log(`[swap] ₱${phpAmount} → ${usdtOut.toFixed(6)} ${currency} for ${userId}`);
    return { usdtOut, rate, txRef };''',
        '''    inspector.success("php-settlement", `PHP ${phpAmount} -> ${usdtOut.toFixed(6)} ${currency} settled for ${userId}`, {
      orderId: txRef, userId, currency, phpAmount, usdtOut, rate,
      step: "settled",
    });
    console.log(`[swap] ₱${phpAmount} → ${usdtOut.toFixed(6)} ${currency} for ${userId}`);
    return { usdtOut, rate, txRef };''',
        "inspector.success on PHP->stablecoin settlement"
    ),
])


# ---------------------------------------------------------------------------
# 4. inspectorBridge.js — STAGE_CATEGORY entries for the new stages
# ---------------------------------------------------------------------------
IB = "src/services/blockchain/inspector/inspectorBridge.js"

patch_file(IB, [
    (
        '''const STAGE_CATEGORY = {
  BlockchainEngine: "scan",
  DepositProcessor: "deposit",
  ConfirmationWorker: "deposit",
  WalletCreditWorker: "deposit",
  LedgerWorker: "deposit",
  RecoveryWorker: "system",
  TreasurySendService: "withdrawal",
  swap: "swap",
};''',
        '''const STAGE_CATEGORY = {
  BlockchainEngine: "scan",
  DepositProcessor: "deposit",
  ConfirmationWorker: "deposit",
  WalletCreditWorker: "deposit",
  LedgerWorker: "deposit",
  RecoveryWorker: "system",
  TreasurySendService: "withdrawal",
  swap: "swap",
  withdrawal: "withdrawal",
  "php-settlement": "swap",
};''',
        "add withdrawal / php-settlement STAGE_CATEGORY entries"
    ),
])


# ---------------------------------------------------------------------------
# 5. knowledgeBase.js — rules for the new failure text
# ---------------------------------------------------------------------------
KB = "src/services/operator/knowledgeBase.js"

patch_file(KB, [
    (
        '''  // ==========================================================
  // FORWARDER SWEEP
  // ==========================================================''',
        '''  // ==========================================================
  // WITHDRAWAL
  // ==========================================================

  {
    code: "WITHDRAWAL_DEBIT_FAILED",
    title: "Withdrawal Debit Failed",
    patterns: [
      "debit failed for wd-"
    ],
    severity: "WARNING",
    confidence: 90,
    recommendation: "No funds moved. Usually a race on the balance check — safe for the user to retry."
  },

  {
    code: "WITHDRAWAL_SEND_FAILED",
    title: "Withdrawal Send Failed (Reversed)",
    patterns: [
      "send failed for wd-"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Ledger debit was reversed automatically. Investigate the on-chain send error before advising retry."
  },

  // ==========================================================
  // PHP SETTLEMENT
  // ==========================================================

  {
    code: "PHP_ONCHAIN_BALANCE_MISMATCH",
    title: "PHP Swap Refused — On-chain Balance Short",
    patterns: [
      "on-chain balance mismatch for user"
    ],
    severity: "WARNING",
    confidence: 96,
    recommendation: "User's on-chain balance is less than claimed — no PHP was credited. Check for a pending/unconfirmed deposit."
  },

  {
    code: "PHP_SWEEP_FAILED",
    title: "PHP Swap Sweep Failed",
    patterns: [
      "sweep failed for"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Stablecoin was never swept to treasury — no PHP was credited. Investigate the sweep error before retrying."
  },

  {
    code: "PHP_SWEEP_MISMATCH",
    title: "PHP Swap Sweep Amount Mismatch",
    patterns: [
      "sweep did not confirm expected amount"
    ],
    severity: "CRITICAL",
    confidence: 97,
    recommendation: "Swept amount didn't match expected — do not credit PHP. Investigate before any manual override."
  },

  // ==========================================================
  // FORWARDER SWEEP
  // ==========================================================''',
        "add WITHDRAWAL and PHP_SETTLEMENT rule sets"
    ),
])

print("\\nAll patches applied. Next: node --check each file, then git --no-pager diff.")
