#!/usr/bin/env python3
"""
Patch: wire the money-moving routes in directDepositRoutes.js into
blockchainInspector. This is separate from the existing inspectorService
flow-tracking calls already in this file (different system, left untouched).
Most catch blocks here currently have zero logging of any kind — this adds
inspector.error at the real failure points.

Run from repo root:  python3 patch_inspector_directdeposit.py
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


DDR = "src/routes/directDepositRoutes.js"

patch(DDR,
    '''import BlockchainInbox from '../models/blockchain/blockchainInboxModel.js';''',
    '''import BlockchainInbox from '../models/blockchain/blockchainInboxModel.js';
import inspector from '../services/blockchain/inspector/blockchainInspector.js';''',
    "import inspector",
    "import inspector from '../services/blockchain/inspector/blockchainInspector.js'"
)

# /request outer catch — currently zero logging at all
patch(DDR,
    '''      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/status/:referenceId ──────────────────────────────────────''',
    '''      },
    });
  } catch (err) {
    inspector.error("php-deposit", `Deposit request failed: ${err.message}`, {
      userId: req.user?.id,
      step: "request",
    });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/status/:referenceId ──────────────────────────────────────''',
    "inspector.error on /request outer catch",
    'inspector.error("php-deposit", `Deposit request failed'
)

# /admin/confirm — ledger credit failure (currently silent besides revert+rethrow)
patch(DDR,
    '''    } catch (ledgerErr) {
      await DirectDeposit.findOneAndUpdate({ referenceId }, { status: 'PENDING' });
      throw ledgerErr;
    }''',
    '''    } catch (ledgerErr) {
      inspector.error("php-deposit", `Ledger credit failed for ref ${referenceId}: ${ledgerErr.message}`, {
        orderId: referenceId,
        userId: deposit.userId?.toString(),
        amount: deposit.amount,
        step: "admin-confirm-credit",
      });
      await DirectDeposit.findOneAndUpdate({ referenceId }, { status: 'PENDING' });
      throw ledgerErr;
    }''',
    "inspector.error on admin-confirm ledger credit failure",
    'inspector.error("php-deposit", `Ledger credit failed'
)

# /admin/confirm outer catch — currently zero logging
patch(DDR,
    '''    console.log(`[DEPOSIT] Admin confirmed ₱${deposit.amount} for user ${deposit.userId} ref:${referenceId}`);
    res.json({ success: true, credited: deposit.amount, referenceId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /deposit/admin/cancel ─────────────────────────────────────────────''',
    '''    console.log(`[DEPOSIT] Admin confirmed ₱${deposit.amount} for user ${deposit.userId} ref:${referenceId}`);
    inspector.success("php-deposit", `Admin confirmed ₱${deposit.amount} for ref ${referenceId}`, {
      orderId: referenceId,
      userId: deposit.userId?.toString(),
      amount: deposit.amount,
      step: "admin-confirm",
    });
    res.json({ success: true, credited: deposit.amount, referenceId });
  } catch (err) {
    inspector.error("php-deposit", `Admin confirm failed: ${err.message}`, {
      step: "admin-confirm",
    });
    res.status(500).json({ error: err.message });
  }
});

// ── POST /deposit/admin/cancel ─────────────────────────────────────────────''',
    "inspector.success/error on admin-confirm completion + outer catch",
    'inspector.success("php-deposit", `Admin confirmed'
)

# /cancel outer catch — currently zero logging (inspectorErr catch is the
# separate flow-tracking system, left untouched)
patch(DDR,
    '''    console.log(`[DEPOSIT] User ${req.user.id} cancelled deposit ref:${referenceId}`);
    res.json({ success: true, deposit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/admin/logs ────────────────────────────────────────────────''',
    '''    console.log(`[DEPOSIT] User ${req.user.id} cancelled deposit ref:${referenceId}`);
    res.json({ success: true, deposit });
  } catch (err) {
    inspector.error("php-deposit", `Deposit cancel failed: ${err.message}`, {
      userId: req.user?.id,
      step: "cancel",
    });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/admin/logs ────────────────────────────────────────────────''',
    "inspector.error on /cancel outer catch",
    'inspector.error("php-deposit", `Deposit cancel failed'
)


# ---------------------------------------------------------------------------
# STAGE_CATEGORY + knowledgeBase for the new "php-deposit" stage
# ---------------------------------------------------------------------------
IB = "src/services/blockchain/inspector/inspectorBridge.js"

patch(IB,
    '''  "php-settlement": "swap",
  deposit: "deposit",
};''',
    '''  "php-settlement": "swap",
  deposit: "deposit",
  "php-deposit": "deposit",
};''',
    "add php-deposit STAGE_CATEGORY entry",
    '"php-deposit": "deposit",'
)

KB = "src/services/operator/knowledgeBase.js"

patch(KB,
    '''  // ==========================================================
  // DEPOSIT
  // ==========================================================''',
    '''  // ==========================================================
  // PHP DEPOSIT (cash-in via GCash/Maya/Bank)
  // ==========================================================

  {
    code: "PHP_DEPOSIT_LEDGER_FAILED",
    title: "PHP Deposit Ledger Credit Failed",
    patterns: [
      "ledger credit failed for ref"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Deposit was reverted to PENDING automatically — safe to retry admin confirm. Investigate the ledger error if it repeats."
  },

  {
    code: "PHP_DEPOSIT_REQUEST_FAILED",
    title: "PHP Deposit Request Failed",
    patterns: [
      "deposit request failed"
    ],
    severity: "WARNING",
    confidence: 88,
    recommendation: "User's cash-in request never got created — safe for them to retry."
  },

  // ==========================================================
  // DEPOSIT
  // ==========================================================''',
    "add PHP_DEPOSIT rule set",
    'code: "PHP_DEPOSIT_LEDGER_FAILED"'
)

print("\nDone. Next: node --check, then git --no-pager diff.")
