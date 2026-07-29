// src/services/operator/remediationEngine.js

/**
 * Playbooks approved for automatic execution, per the roadmap:
 *   "Initial automated playbooks should be limited to safe operations
 *    such as: RPC_RETRY, RPC_FAILOVER, TREASURY_HEALTH."
 *
 * TREASURY_REFILL is a real, existing playbook (used by TREASURY_DEADLOCK,
 * TREASURY_CRITICAL, and TREASURY_WARNING in knowledge/treasury.js) but is
 * deliberately NOT whitelisted here — it injects liquidity, a financial
 * operation, and stays manual-only per "high-risk actions ... remain
 * manual until explicitly approved."
 *
 * Everything else (MANUAL_INVESTIGATION, MANUAL_REVIEW, AWAIT_CONFIRMATION,
 * NONCE_RESYNC, SWAP_RETRY_SLIPPAGE, WORKER_RESTART, SAFE_TO_RETRY,
 * FORWARDER_SWEEP_RETRY) has no handler and is not whitelisted — these
 * will always resolve to SKIPPED until a handler is written and the name
 * is explicitly added below.
 */
const AUTO_REMEDIATION_WHITELIST = new Set([
  "RPC_RETRY",
  "RPC_FAILOVER",
  "TREASURY_HEALTH"
]);

/**
 * Handler stubs for the 3 whitelisted playbooks.
 *
 * None of these are wired to real infrastructure yet — I don't have
 * visibility into your RPC provider manager or treasury health-check
 * invocation code, so faking a call here would just be a plausible-looking
 * no-op that silently does nothing in production. Each stub returns
 * SKIPPED with an explicit reason instead of pretending to succeed.
 * Replace the body with the real call when you're ready to wire it up.
 */
const PLAYBOOK_HANDLERS = {
  async RPC_RETRY(incident) {
    // TODO: wire to real RPC retry logic (e.g. re-issue the failed call
    // against the current/next healthy endpoint).
    return { status: "SKIPPED", reason: "RPC_RETRY has no handler wired yet" };
  },

  async RPC_FAILOVER(incident) {
    // TODO: wire to real RPC provider failover logic.
    return { status: "SKIPPED", reason: "RPC_FAILOVER has no handler wired yet" };
  },

  async TREASURY_HEALTH(incident) {
    // TODO: wire to real treasury health re-check logic.
    return { status: "SKIPPED", reason: "TREASURY_HEALTH has no handler wired yet" };
  }
};

const remediationEngine = {
  name: "Remediation Engine",
  domain: "intelligence",
  type: "recovery_executor",
  owner: "Platform Intelligence",
  description:
    "Executes approved automatic recovery actions for supported incidents while maintaining a complete audit trail of every remediation attempt.",
  purpose: [
    "Execute Automatic Recovery",
    "Validate Current State",
    "Prevent Unsafe Recovery",
    "Record Recovery Actions",
    "Escalate Unsupported Incidents"
  ],
  lifecycle: {
    startup: "Loads the remediation whitelist and recovery handlers.",
    runtime:
      "Receives incidents, validates eligibility, executes recovery handlers and records outcomes.",
    shutdown: "Stateless service."
  },
  dependsOn: [
    "incidentEngine",
    "operatorActionModel",
    "flowerOrderRecovery"
  ],
  provides: [
    "Automatic Recovery",
    "Recovery Audit",
    "Recovery Execution",
    "Recovery Status"
  ],
  consumedBy: [
    "Operator",
    "Mission Control",
    "Telegram",
    "Dashboard"
  ],
  inputs: ["Incident"],
  outputs: ["SUCCEEDED", "FAILED", "SKIPPED"],
  healthChecks: [
    "Whitelist Loaded",
    "Recovery Handler Availability",
    "Recovery Execution",
    "Audit Logging"
  ],
  metrics: [
    "Recovery Attempts",
    "Recovery Success Rate",
    "Recovery Failure Rate",
    "Skipped Recoveries",
    "Average Recovery Time"
  ],
  failureModes: [
    "Missing Recovery Handler",
    "Recovery Execution Failure",
    "Audit Logging Failure",
    "Invalid Incident State"
  ],
  recovery: {
    automatic: ["Execute Approved Handler", "Log Every Outcome"],
    manual: ["Operator Review", "Manual Intervention", "Escalation"]
  },
  notificationPolicy: {
    warning: ["Dashboard"],
    critical: ["Telegram", "Incident Engine", "Dashboard"]
  },
  criticality: "CRITICAL",

  /**
   * Dispatches on incident.playbook. Never throws — every path resolves
   * to SUCCEEDED / FAILED / SKIPPED, and every outcome is logged for audit.
   *
   * Order of checks:
   *   1. incident has no playbook                    -> SKIPPED
   *   2. playbook not on AUTO_REMEDIATION_WHITELIST   -> SKIPPED
   *   3. incident.autoRemediation !== true            -> SKIPPED
   *      (the knowledge entry itself opted out, even if the playbook
   *      is whitelisted — see TREASURY_HEALTH note below)
   *   4. handler throws                                -> FAILED
   *   5. handler resolves                              -> whatever it returns
   *      (currently always SKIPPED, since no handler is wired yet)
   */
  async attemptRemediation(incident) {
    const playbook = incident?.playbook;
    const timestamp = new Date().toISOString();

    const record = (outcome) => {
      console.log(
        `[Remediation] incident=${incident?.id} code=${incident?.code} ` +
        `playbook=${playbook || "(none)"} -> ${outcome.status}` +
        (outcome.reason ? ` (${outcome.reason})` : "") +
        ` @ ${timestamp}`
      );
      return outcome;
    };

    if (!playbook) {
      return record({ status: "SKIPPED", reason: "Incident has no playbook" });
    }

    if (!AUTO_REMEDIATION_WHITELIST.has(playbook)) {
      return record({
        status: "SKIPPED",
        reason: `Playbook "${playbook}" is not on the automatic-remediation whitelist`
      });
    }

    // NOTE: TREASURY_HEALTH is whitelisted per the roadmap, but the actual
    // TREASURY_CHECK_FAILED entry in knowledge/treasury.js currently has
    // autoRemediation: false. That means TREASURY_HEALTH will resolve to
    // SKIPPED here today, not because of this engine, but because the
    // knowledge entry itself hasn't opted in yet. Flagging this rather
    // than silently overriding either side — confirm which should govern
    // before relying on TREASURY_HEALTH auto-firing.
    if (incident.autoRemediation !== true) {
      return record({
        status: "SKIPPED",
        reason: `Playbook "${playbook}" is whitelisted, but this incident's knowledge entry has autoRemediation=false`
      });
    }

    const handler = PLAYBOOK_HANDLERS[playbook];
    if (typeof handler !== "function") {
      return record({
        status: "SKIPPED",
        reason: `Playbook "${playbook}" is whitelisted but has no handler function defined`
      });
    }

    try {
      const result = await handler(incident);
      return record(result);
    } catch (err) {
      return record({ status: "FAILED", reason: err.message });
    }
  }
};

export default remediationEngine;
