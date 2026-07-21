#!/usr/bin/env python3
"""
Patch: wire cryptoWithdrawalController.js + phpSettlementService.js into
blockchainInspector, plus matching STAGE_CATEGORY and knowledgeBase entries.

All anchors verified against actual file content via repr() dump.
Idempotent — safe to re-run, skips anything already patched.

Run from repo root:  python3 patch_inspector_phase1_v3.py
"""
import sys
from pathlib import Path

def patch(path, old, new, label, already_marker):
    p = Path(path)
    if not p.exists():
        print(f"ABORT: {path} does not exist")
        sys.exit(1)
    text = p.read_text()
    if already_marker in text:
        print(f"  skip (already patched): {label}")
        return
    count = text.count(old)
    if count == 0:
        print(f"ABORT: anchor not found in {path} — {label}")
        print("----- expected anchor -----")
        print(repr(old))
        sys.exit(1)
    if count > 1:
        print(f"ABORT: anchor matched {count} times (expected 1) in {path} — {label}")
        sys.exit(1)
    p.write_text(text.replace(old, new))
    print(f"OK: {label}")


# ---------------------------------------------------------------------------
# 1. cryptoWithdrawalController.js
# ---------------------------------------------------------------------------
CWC = "src/controllers/cryptoWithdrawalController.js"

patch(CWC,
    '''import { estimateNetworkFee } from "../services/treasury/gasEstimationService.js";''',
    '''import { estimateNetworkFee } from "../services/treasury/gasEstimationService.js";
import inspector from "../services/blockchain/inspector/blockchainInspector.js";''',
    "import inspector",
    'import inspector from "../services/blockchain/inspector/blockchainInspector.js"'
)

patch(CWC,
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
    "inspector.warn on fee estimate fallback",
    'inspector.warn("withdrawal", `Live fee estimate failed'
)

# single-line anchor — avoids the blank-line drift that broke this earlier
patch(CWC,
    '''console.error("[cryptoWithdrawal] error:", err);''',
    '''inspector.error("withdrawal", `Withdrawal creation failed: ${err.message}`, {
      userId: req.user?.id,
      step: "create",
    });
    console.error("[cryptoWithdrawal] error:", err);''',
    "inspector.error on withdrawal creation failure",
    'inspector.error("withdrawal", `Withdrawal creation failed'
)


# ---------------------------------------------------------------------------
# 2. phpSettlementService.js
# ---------------------------------------------------------------------------
PSS = "src/services/swap/phpSettlementService.js"

patch(PSS,
    '''import Transaction from '../../models/transactionModel.js';''',
    '''import Transaction from '../../models/transactionModel.js';
import inspector from '../blockchain/inspector/blockchainInspector.js';''',
    "import inspector",
    "import inspector from '../blockchain/inspector/blockchainInspector.js'"
)

patch(PSS,
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
    "inspector.warn on pool balance fetch failure",
    'inspector.warn("php-settlement", `On-chain balance fetch failed'
)

patch(PSS,
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
    "inspector.info on pool reconciliation",
    'inspector.info("php-settlement", `Reconciling'
)

# single-line anchor
patch(PSS,
    '''    if (onChainBalance < stablecoinAmount) {''',
    '''    if (onChainBalance < stablecoinAmount) {
      inspector.error("php-settlement", `On-chain balance mismatch for user ${userId}: has ${onChainBalance} ${currency}, claims ${stablecoinAmount}`, {
        orderId: txRef,
        userId, currency, chain,
        onChainBalance, claimedAmount: stablecoinAmount,
        step: "balance-check",
      });''',
    "inspector.error on on-chain balance mismatch",
    'inspector.error("php-settlement", `On-chain balance mismatch'
)

# single-line anchor
patch(PSS,
    '''      throw new Error(`Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`);''',
    '''      inspector.error("php-settlement", `Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`, {
        orderId: txRef, userId, chain, currency, amount: stablecoinAmount, step: "sweep",
      });
      throw new Error(`Sweep failed for ${userId} on ${chain}: ${sweepErr.message}`);''',
    "inspector.error on sweep failure",
    'inspector.error("php-settlement", `Sweep failed for'
)

# single-line anchor
patch(PSS,
    '''    if (!sweepResult?.txHash || sweepResult.swept < stablecoinAmount) {''',
    '''    if (!sweepResult?.txHash || sweepResult.swept < stablecoinAmount) {
      inspector.error("php-settlement", `Sweep did not confirm expected amount for ${userId} on ${chain}: swept ${sweepResult?.swept ?? 0}, expected ${stablecoinAmount}`, {
        orderId: txRef, userId, chain, currency,
        swept: sweepResult?.swept ?? 0, expected: stablecoinAmount,
        step: "sweep-confirm",
      });''',
    "inspector.error on sweep amount mismatch",
    'inspector.error("php-settlement", `Sweep did not confirm'
)

# single-line anchor
patch(PSS,
    '''    console.log(`[swap] sweep confirmed for ${userId}:`, sweepResult);''',
    '''    inspector.success("php-settlement", `Sweep confirmed for ${userId}`, {
      orderId: txRef, userId, chain, currency,
      swept: sweepResult.swept, txHash: sweepResult.txHash,
      step: "sweep-confirm",
    });
    console.log(`[swap] sweep confirmed for ${userId}:`, sweepResult);''',
    "inspector.success on sweep confirmation",
    'inspector.success("php-settlement", `Sweep confirmed'
)

# single-line anchor
patch(PSS,
    '''    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);''',
    '''    inspector.success("php-settlement", `${stablecoinAmount} ${currency} -> PHP ${phpOut.toFixed(2)} settled for ${userId}`, {
      orderId: txRef, userId, currency, stablecoinAmount, phpOut, rate,
      step: "settled",
    });
    console.log(`[swap] ${stablecoinAmount} ${currency} → ₱${phpOut.toFixed(2)} for ${userId}`);''',
    "inspector.success on stablecoin->PHP settlement",
    'inspector.success("php-settlement", `${stablecoinAmount}'
)

# single-line anchor
patch(PSS,
    '''    console.log(`[swap] ₱${phpAmount} → ${usdtOut.toFixed(6)} ${currency} for ${userId}`);''',
    '''    inspector.success("php-settlement", `PHP ${phpAmount} -> ${usdtOut.toFixed(6)} ${currency} settled for ${userId}`, {
      orderId: txRef, userId, currency, phpAmount, usdtOut, rate,
      step: "settled",
    });
    console.log(`[swap] ₱${phpAmount} → ${usdtOut.toFixed(6)} ${currency} for ${userId}`);''',
    "inspector.success on PHP->stablecoin settlement",
    'inspector.success("php-settlement", `PHP ${phpAmount}'
)


# ---------------------------------------------------------------------------
# 3. inspectorBridge.js — STAGE_CATEGORY entries
# ---------------------------------------------------------------------------
IB = "src/services/blockchain/inspector/inspectorBridge.js"

patch(IB,
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
    "add withdrawal / php-settlement STAGE_CATEGORY entries",
    '"php-settlement": "swap"'
)


# ---------------------------------------------------------------------------
# 4. knowledgeBase.js — WITHDRAWAL + PHP_SETTLEMENT rule sets
# ---------------------------------------------------------------------------
KB = "src/services/operator/knowledgeBase.js"

patch(KB,
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
    "add WITHDRAWAL and PHP_SETTLEMENT rule sets",
    'code: "WITHDRAWAL_DEBIT_FAILED"'
)

print("\nAll done. Next: node --check each file, then git --no-pager diff.")
