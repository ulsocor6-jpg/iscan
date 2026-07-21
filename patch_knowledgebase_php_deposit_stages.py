#!/usr/bin/env python3
"""
Patch: add structured knowledgeBase rules for each PHP_DEPOSIT flow stage,
so failStage() emissions get a real diagnosis instead of falling through
to the generic "UNKNOWN" incident.

Idempotent — safe to re-run, skips anything already patched.
Finds the LAST "];" in the file and inserts new rules before it, rather
than matching an exact whitespace-sensitive block (which failed once
already due to invisible formatting differences).

Run from repo root:  python3 patch_knowledgebase_php_deposit_stages.py
"""
import sys
from pathlib import Path

path = Path("src/services/operator/knowledgeBase.js")
if not path.exists():
    print(f"ABORT: {path} does not exist")
    sys.exit(1)

text = path.read_text()

marker = "PHP DEPOSIT — FLOW STAGE FAILURES"
if marker in text:
    print("SKIP: already patched")
    sys.exit(0)

last_close = text.rfind("];")
if last_close == -1:
    print("ABORT: could not find closing '];' in file")
    sys.exit(1)

# Walk backward from the last "];" to the previous "}" so we can insert
# a comma after it, then our new rules, then the closing "];".
prev_close_brace = text.rfind("}", 0, last_close)
if prev_close_brace == -1:
    print("ABORT: could not find preceding '}' before closing '];'")
    sys.exit(1)

insertion_point = prev_close_brace + 1  # right after that '}'

new_rules = ''',
  // ==========================================================
  // PHP DEPOSIT — FLOW STAGE FAILURES (Inspector model, structured)
  // ==========================================================
  {
    code: "PHP_DEPOSIT_PARSER_STAGE_FAILED",
    title: "PHP Deposit Parser Stage Failed",
    severity: "WARNING",
    confidence: 75,
    recommendation: "Deposit notification failed to parse in the flow's PARSER stage — check the flow's stage input/error in Inspector.",
    match(event) {
      return event.stage === "PARSER" && event.metadata?.pipeline === "PHP_DEPOSIT";
    }
  },
  {
    code: "PHP_DEPOSIT_USER_LOOKUP_STAGE_FAILED",
    title: "PHP Deposit User Lookup Failed",
    severity: "WARNING",
    confidence: 80,
    recommendation: "Could not match the deposit to a user — likely a sender/account mismatch. Check the flow's USER_LOOKUP stage for details.",
    match(event) {
      return event.stage === "USER_LOOKUP" && event.metadata?.pipeline === "PHP_DEPOSIT";
    }
  },
  {
    code: "PHP_DEPOSIT_MATCH_STAGE_FAILED",
    title: "PHP Deposit Match Failed",
    severity: "WARNING",
    confidence: 80,
    recommendation: "No matching PENDING deposit found (or ambiguous match) — needs manual review.",
    match(event) {
      return event.stage === "DEPOSIT_MATCH" && event.metadata?.pipeline === "PHP_DEPOSIT";
    }
  },
  {
    code: "PHP_DEPOSIT_VERIFIER_STAGE_FAILED",
    title: "PHP Deposit Verifier Failed",
    severity: "WARNING",
    confidence: 82,
    recommendation: "Deposit was no longer eligible at verify time — check for a race with expiry or a second claim.",
    match(event) {
      return event.stage === "VERIFIER" && event.metadata?.pipeline === "PHP_DEPOSIT";
    }
  },
  {
    code: "PHP_DEPOSIT_LEDGER_STAGE_FAILED",
    title: "PHP Deposit Ledger Stage Failed",
    severity: "HIGH",
    confidence: 90,
    recommendation: "Ledger credit failed inside the deposit flow — funds not yet credited. Investigate before manually crediting.",
    match(event) {
      return event.stage === "LEDGER" && event.metadata?.pipeline === "PHP_DEPOSIT";
    }
  },
  {
    code: "PHP_DEPOSIT_WALLET_STAGE_FAILED",
    title: "PHP Deposit Wallet Stage Failed",
    severity: "HIGH",
    confidence: 90,
    recommendation: "Ledger credited but wallet update failed — check for a ledger/wallet balance mismatch before retrying.",
    match(event) {
      return event.stage === "WALLET" && event.metadata?.pipeline === "PHP_DEPOSIT";
    }
  },
  {
    code: "PHP_DEPOSIT_EVENT_STREAM_STAGE_FAILED",
    title: "PHP Deposit Event Stream Failed",
    severity: "WARNING",
    confidence: 70,
    recommendation: "Deposit completed and credited, but the realtime event failed to publish — cosmetic only, dashboard may be stale for this flow.",
    match(event) {
      return event.stage === "EVENT_STREAM" && event.metadata?.pipeline === "PHP_DEPOSIT";
    }
  }
'''

patched = text[:insertion_point] + new_rules + text[insertion_point:]
path.write_text(patched)
print("OK: inserted PHP_DEPOSIT stage rules before final '];'")
print("Review with: git --no-pager diff")
