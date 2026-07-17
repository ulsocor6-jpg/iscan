#!/usr/bin/env python3
"""
Patch: fix incidentEngine.js level/field-mapping bugs + add FORWARDER_SWEEP
rules to knowledgeBase.js.

Run from repo root:  python3 patch_operator_incident_wiring.py
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
# 1. incidentEngine.js — fix level-case bug + source/orderId field mapping
# ---------------------------------------------------------------------------
INCIDENT_ENGINE = "src/services/operator/incidentEngine.js"

patch_file(INCIDENT_ENGINE, [
    (
        '''  process(event) {
    // Ignore normal operations
    if (!["warn", "error"].includes(event.level)) {
      return null;
    }''',
        '''  process(event) {
    // Ignore normal operations.
    // blockchainInspector emits level as "WARNING"/"ERROR" (uppercase) —
    // compare case-insensitively so this never silently discards
    // everything again if either side's casing changes.
    const level = String(event.level || "").toLowerCase();
    if (!["warn", "warning", "error"].includes(level)) {
      return null;
    }''',
        "level-case bug (was comparing lowercase against uppercase, discarding every event)"
    ),
    (
        '''    const incident = {
      id: crypto.randomUUID(),

      key,

      source: event.source,      // swap
      orderId: event.orderId,

      severity: diagnosis.severity,
      confidence: diagnosis.confidence,

      diagnosis: diagnosis.title,
      recommendation: diagnosis.recommendation,

      status: "OPEN",

      createdAt: new Date(),

      event
    };''',
        '''    const incident = {
      id: crypto.randomUUID(),

      key,

      // blockchainInspector.log() never sets top-level source/orderId —
      // stage is the source, and orderId (like every other identifier)
      // lives inside metadata. Reading event.source/event.orderId
      // directly always produced undefined here.
      source: event.stage,
      orderId: event.metadata?.orderId,

      severity: diagnosis.severity,
      confidence: diagnosis.confidence,

      diagnosis: diagnosis.title,
      recommendation: diagnosis.recommendation,
      message: event.message,
      metadata: event.metadata || {},

      status: "OPEN",

      createdAt: new Date(),

      event
    };''',
        "source/orderId field mapping bug (read nonexistent top-level fields; also added message/metadata passthrough for future consumers like a client-facing chat)"
    ),
])


# ---------------------------------------------------------------------------
# 2. knowledgeBase.js — add FORWARDER_SWEEP rule set
# ---------------------------------------------------------------------------
KNOWLEDGE_BASE = "src/services/operator/knowledgeBase.js"

patch_file(KNOWLEDGE_BASE, [
    (
        '''  // ==========================================================
  // DATABASE
  // ==========================================================

  {
    code: "DATABASE",''',
        '''  // ==========================================================
  // FORWARDER SWEEP
  // ==========================================================

  {
    code: "FORWARDER_TRANSFER_FAILED",
    title: "Forwarder Sweep Transfer Failed",
    patterns: [
      "depositforwarder: native transfer failed",
      "depositforwarder: token transfer failed"
    ],
    severity: "HIGH",
    confidence: 95,
    recommendation: "Retry the sweep; if it keeps failing, inspect the forwarder's on-chain balance and treasury contract state."
  },

  {
    code: "FORWARDER_ADDRESS_MISMATCH",
    title: "Forwarder Address Mismatch",
    patterns: [
      "forwarderfactory: address mismatch"
    ],
    severity: "CRITICAL",
    confidence: 99,
    recommendation: "Stop sweeping this salt immediately — the CREATE2 address did not match. Investigate factory/init-code integrity before retrying."
  },

  {
    code: "SWEEP_GAS_NOT_CONFIGURED",
    title: "Sweep Treasury Key Missing",
    patterns: [
      "base_treasury_private_key is not set",
      "ronin_treasury_private_key is not set",
      "cannot pay gas for forwarder sweep",
      "cannot fund gas for sweep"
    ],
    severity: "CRITICAL",
    confidence: 100,
    recommendation: "Set the treasury private key env var — sweeps cannot pay gas without it."
  },

  {
    code: "SWEEP_SHORT_BALANCE",
    title: "Sweep Refused — Balance Short",
    patterns: [
      "refusing to sweep a short amount",
      "has no receivedamount to sweep"
    ],
    severity: "WARNING",
    confidence: 92,
    recommendation: "On-chain balance is less than expected — check for a partial or pending deposit before forcing a sweep."
  },

  // ==========================================================
  // DATABASE
  // ==========================================================

  {
    code: "DATABASE",''',
        "add FORWARDER_SWEEP rule set before DATABASE section"
    ),
])

print("\\nAll patches applied. Next: node --check on both files, then git --no-pager diff.")
