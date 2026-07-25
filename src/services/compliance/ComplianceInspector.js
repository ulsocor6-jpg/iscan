// src/services/compliance/ComplianceInspector.js
import brainBus from "../../brainbus/brainBus.js";
import { Channels } from "../../brainbus/channels.js";
import { checkSanctions } from "./checks/sanctionsCheck.js";
import { checkTokenSecurity } from "./checks/tokenSecurityCheck.js";
import { evaluateBehavioralRisk } from "./checks/behavioralRisk.js";

// ---- Placeholder sub-checks (will be replaced with real integrations) ----

async function tokenAllowlistCheck(tokens) {
  const TokenWhitelist = (await import("../../models/compliance/TokenWhitelist.js")).default;
  const whitelisted = await TokenWhitelist.find({ symbol: { $in: tokens } }).lean();
  const whitelistedSymbols = new Set(whitelisted.map(t => t.symbol));
  const risky = tokens.filter(s => !whitelistedSymbols.has(s));
  return {
    passed: risky.length === 0,
    reason: risky.length ? `Untrusted tokens: ${risky.join(",")}` : null,
    score: risky.length * 25,
  };
}

import { checkWalletAml } from "./checks/walletAmlCheck.js";
async function walletAmlCheck(address) {
  const result = await checkWalletAml(address);
  return { passed: result.passed, score: result.score, reason: result.reason };
}

async function tokenSecurityCheck(tokens) {
  const result = await checkTokenSecurity(tokens);
  return { passed: result.passed, score: result.score, reason: result.reasons?.join("; ") || null };
}

import { checkContractAnalysis } from "./checks/contractAnalysis.js";
async function contractAnalysisCheck(tokens) {
  const result = await checkContractAnalysis(tokens);
  return { passed: result.passed, score: result.score, reason: result.reasons?.join("; ") || null };
}

async function sanctionsCheck(address) {
  const result = await checkSanctions(address);
  return { passed: result.passed, score: result.score, reason: result.reason };
}

async function behavioralRiskCheck(activity) {
  const result = await evaluateBehavioralRisk(activity);
  return { passed: result.passed, score: result.score, reason: result.reasons?.join("; ") || null };
}

// ---- Main Inspector ----

// A check throwing must never mean "no opinion" — it must mean "assume
// the worst," since a silent failure here is indistinguishable from a
// clean result to everything downstream (halt set, operator dashboard).
async function safeCheck(name, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[ComplianceInspector] ${name} check threw — treating as max risk:`, err.message);
    return { passed: false, score: 100, reason: `Check errored (assumed risky): ${err.message}` };
  }
}

// These checks represent unconditional business/legal rules, not signals
// to be averaged against everything else. A failure here forces REJECT
// no matter what the weighted score says.
//  - Sanctions / WalletAML: a confirmed match is a legal stop, not a "maybe."
//  - TokenAllowlist: crediting a token we can't liquidate on a CEX is a
//    direct, un-recoverable treasury loss regardless of how "safe" the
//    token looks on other axes.
const HARD_BLOCKERS = ["Sanctions", "WalletAML", "TokenAllowlist"];

async function inspect(correlatedActivity) {
  const { address, tokens, events, ...activity } = correlatedActivity;

  const checks = [
    { name: "TokenAllowlist", result: await safeCheck("TokenAllowlist", () => tokenAllowlistCheck(tokens)) },
    { name: "WalletAML", result: await safeCheck("WalletAML", () => walletAmlCheck(address)) },
    { name: "TokenSecurity", result: await safeCheck("TokenSecurity", () => tokenSecurityCheck(tokens)) },
    { name: "ContractAnalysis", result: await safeCheck("ContractAnalysis", () => contractAnalysisCheck(tokens)) },
    { name: "Sanctions", result: await safeCheck("Sanctions", () => sanctionsCheck(address)) },
    { name: "BehavioralRisk", result: await safeCheck("BehavioralRisk", () => behavioralRiskCheck(activity)) },
  ];

  // Weighted total score (0-100)
  const weights = {
    TokenAllowlist: 15,
    WalletAML: 30,
    TokenSecurity: 15,
    ContractAnalysis: 10,
    Sanctions: 20,
    BehavioralRisk: 10,
  };

  let totalScore = 0;
  const details = {};
  checks.forEach(({ name, result }) => {
    details[name] = { ...result, weight: weights[name] };
    totalScore += (result.score / 100) * weights[name];
  });

  totalScore = Math.min(Math.round(totalScore), 100);

  const hardBlock = checks.find(
    (c) => HARD_BLOCKERS.includes(c.name) && !c.result.passed
  );

  const recommendation = hardBlock
    ? "REJECT"
    : totalScore >= 70
    ? "REJECT"
    : totalScore >= 40
    ? "REVIEW"
    : "APPROVE";

  const riskEvent = {
    address,
    tokens,
    windowMs: activity.windowMs,
    totalScore,
    details,
    hardBlockedBy: hardBlock ? hardBlock.name : null,
    recommendation,
    timestamp: Date.now(),
  };

  console.log("[ComplianceInspector] Risk scored:", riskEvent);

  brainBus.emit(Channels.COMPLIANCE_RISK_SCORE, riskEvent, {
    source: "ComplianceInspector",
    correlationId: address,
  });
}

// Listen for correlated activity
brainBus.on(Channels.COMPLIANCE_CORRELATED, (activity) => {
  inspect(activity).catch(err => console.error("[ComplianceInspector] Error:", err));
});

console.log("[ComplianceInspector] Listening on compliance:correlated");

export function startComplianceInspector() {
  console.log("[ComplianceInspector] Started");
}
