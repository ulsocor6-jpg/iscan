#!/usr/bin/env python3
"""
Patch: wire baseStableListener.js (Base USDC/USDT deposit detection) into
blockchainInspector, plus a matching STAGE_CATEGORY entry and knowledgeBase
rule for deposit processing failures.

Run from repo root:  python3 patch_inspector_basestablelistener.py
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
        print(repr(old))
        sys.exit(1)
    if count > 1:
        print(f"ABORT: anchor matched {count} times — {label}")
        sys.exit(1)
    p.write_text(text.replace(old, new))
    print(f"OK: {label}")


BSL = "src/services/blockchain/baseStableListener.js"

patch(BSL,
    '''import { createDetectedDeposit } from "../cryptoDepositPipeline.js";''',
    '''import { createDetectedDeposit } from "../cryptoDepositPipeline.js";
import inspector from "./inspector/blockchainInspector.js";''',
    "import inspector",
    'import inspector from "./inspector/blockchainInspector.js"'
)

patch(BSL,
    '''    console.log(
      `[BASE STABLE] Detected ${amount} ${symbol} at ${addr.address} tx=${log.transactionHash}`
    );''',
    '''    console.log(
      `[BASE STABLE] Detected ${amount} ${symbol} at ${addr.address} tx=${log.transactionHash}`
    );
    inspector.info("deposit", `Detected ${amount} ${symbol} at ${addr.address}`, {
      orderId: log.transactionHash,
      userId: addr.userId,
      token: symbol,
      amount,
      chain: "base",
      step: "detect",
    });''',
    "inspector.info on deposit detected",
    'inspector.info("deposit", `Detected'
)

patch(BSL,
    '''      if (!result) {
        console.log(
          `[BASE STABLE] Duplicate transaction ignored ${log.transactionHash}`
        );
      }
    } catch (err) {
      console.error(
        `[BASE STABLE] Failed processing ${log.transactionHash}:`,
        err.message
      );
    }''',
    '''      if (!result) {
        console.log(
          `[BASE STABLE] Duplicate transaction ignored ${log.transactionHash}`
        );
        inspector.info("deposit", `Duplicate transaction ignored`, {
          orderId: log.transactionHash,
          userId: addr.userId,
          token: symbol,
          chain: "base",
          step: "detect",
        });
      }
    } catch (err) {
      console.error(
        `[BASE STABLE] Failed processing ${log.transactionHash}:`,
        err.message
      );
      inspector.error("deposit", `Failed processing deposit tx ${log.transactionHash}: ${err.message}`, {
        orderId: log.transactionHash,
        userId: addr.userId,
        token: symbol,
        amount,
        chain: "base",
        step: "detect",
      });
    }''',
    "inspector.info/error on duplicate + processing failure",
    'inspector.error("deposit", `Failed processing deposit tx'
)

patch(BSL,
    '''        } catch (err) {
          console.error(
            `[BASE STABLE] ${symbol}:`,
            err.message
          );
        }''',
    '''        } catch (err) {
          console.error(
            `[BASE STABLE] ${symbol}:`,
            err.message
          );
          inspector.error("deposit", `Base stable scan failed for ${symbol}: ${err.message}`, {
            symbol, chain: "base", step: "scan",
          });
        }''',
    "inspector.error on per-symbol scan failure",
    'inspector.error("deposit", `Base stable scan failed for'
)

patch(BSL,
    '''    } catch (err) {
      console.error(
        "[BASE STABLE]",
        err.message
      );
    }
  }, 30000);''',
    '''    } catch (err) {
      console.error(
        "[BASE STABLE]",
        err.message
      );
      inspector.error("deposit", `Base stable listener watch loop failed: ${err.message}`, {
        chain: "base", step: "watch-loop",
      });
    }
  }, 30000);''',
    "inspector.error on outer watch-loop failure",
    'inspector.error("deposit", `Base stable listener watch loop failed'
)


# ---------------------------------------------------------------------------
# STAGE_CATEGORY — lowercase "deposit" stage used here (distinct from the
# existing PascalCase DepositProcessor key)
# ---------------------------------------------------------------------------
IB = "src/services/blockchain/inspector/inspectorBridge.js"

patch(IB,
    '''  withdrawal: "withdrawal",
  "php-settlement": "swap",
};''',
    '''  withdrawal: "withdrawal",
  "php-settlement": "swap",
  deposit: "deposit",
};''',
    "add lowercase 'deposit' STAGE_CATEGORY entry",
    'deposit: "deposit",'
)


# ---------------------------------------------------------------------------
# knowledgeBase.js — deposit processing failure rule
# ---------------------------------------------------------------------------
KB = "src/services/operator/knowledgeBase.js"

patch(KB,
    '''  // ==========================================================
  // WITHDRAWAL
  // ==========================================================''',
    '''  // ==========================================================
  // DEPOSIT
  // ==========================================================

  {
    code: "DEPOSIT_PROCESSING_FAILED",
    title: "Deposit Processing Failed",
    patterns: [
      "failed processing deposit tx"
    ],
    severity: "HIGH",
    confidence: 92,
    recommendation: "Deposit was detected on-chain but failed to process — check cryptoDepositPipeline for the underlying error before assuming funds are lost."
  },

  {
    code: "DEPOSIT_SCAN_FAILED",
    title: "Deposit Scan Failed",
    patterns: [
      "base stable scan failed for",
      "base stable listener watch loop failed"
    ],
    severity: "WARNING",
    confidence: 85,
    recommendation: "A scan cycle failed — usually transient (RPC hiccup). If it repeats, check RPC provider health."
  },

  // ==========================================================
  // WITHDRAWAL
  // ==========================================================''',
    "add DEPOSIT rule set",
    'code: "DEPOSIT_PROCESSING_FAILED"'
)

print("\nDone. Next: node --check, then git --no-pager diff.")
