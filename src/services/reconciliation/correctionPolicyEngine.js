// src/services/reconciliation/correctionPolicyEngine.js
//
// Takes a drift-classified proposal and decides AUTO_APPROVED vs
// NEED_APPROVAL. This is the one place that actually gets to say "apply
// this without a human" - keep every rule here explicit and loggable
// rather than scattering "just apply it" logic elsewhere.
//
// Rules run in order; ANY failing rule forces NEED_APPROVAL. Rules never
// throw for a policy failure - they return a reason string. They only
// throw for genuine infra errors (DB down, etc), which the caller should
// treat as NEED_APPROVAL too (fail closed, never fail open into auto-apply).

import Wallet from '../../models/walletModel.js';

const AUTO_APPROVE_MAX = {
  USDC: Number(process.env.RECON_AUTO_APPROVE_MAX_USDC ?? 5),
  USDT: Number(process.env.RECON_AUTO_APPROVE_MAX_USDT ?? 5),
};

// Rule: hard ceiling on auto-approved amount, independent of the
// SAFE_DRIFT/RISK_DRIFT split from the classifier (defense in depth - if
// someone loosens the classifier thresholds later, this rule still caps
// what can be auto-applied).
function checkAmountThreshold(proposal) {
  const max = AUTO_APPROVE_MAX[proposal.currency] ?? 0;
  if (Math.abs(proposal.drift) > max) {
    return `amount ${Math.abs(proposal.drift)} ${proposal.currency} exceeds auto-approve max ${max}`;
  }
  return null;
}

// Rule: only SAFE_DRIFT is eligible for auto-approval at all. RISK_DRIFT
// always needs a human, no matter what the other rules say.
function checkRiskLevel(proposal) {
  if (proposal.riskLevel !== 'SAFE_DRIFT') {
    return `riskLevel is ${proposal.riskLevel}, not SAFE_DRIFT`;
  }
  return null;
}

// Rule: tx confirmation. reconciliationService.getOnChainTotal() only
// returns aggregate on-chain balances per chain, not individual deposit
// tx hashes/confirmations - so this engine cannot currently verify that a
// specific deposit backing a chain_ahead_of_ledger credit has enough
// confirmations. Known limitation: until getOnChainTotal is extended to
// return tx-level detail, credits (chain_ahead_of_ledger) are never
// auto-approved regardless of amount - only debits (ledger_ahead_of_chain,
// which need no chain confirmation since we're removing an unbacked
// ledger claim) can pass this rule.
function checkTxConfirmation(proposal) {
  if (proposal.direction === 'chain_ahead_of_ledger') {
    return 'crediting user from on-chain balance requires tx-level confirmation data, which getOnChainTotal() does not currently provide';
  }
  return null;
}

// Rule: fraud checks. Placeholder hook - wire your actual fraud/risk
// service here when one exists. Fails closed (blocks auto-approval) if
// it can't run rather than silently passing.
async function checkFraudSignals(proposal) {
  // TODO: integrate real fraud signal service, e.g.:
  // const flagged = await fraudCheckService.isUserFlagged(proposal.userId);
  // if (flagged) return 'user has an open fraud flag';
  return null;
}

// Rule: account status. Never auto-correct (or even silently queue) a
// suspended account without a human looking at it.
async function checkAccountStatus(proposal) {
  const wallet = await Wallet.findOne({ userId: proposal.userId }, { status: 1 });
  if (!wallet || wallet.status !== 'active') {
    return `wallet status is ${wallet?.status ?? 'missing'}, not active`;
  }
  return null;
}

export async function evaluateCorrection(proposal) {
  const reasons = [];

  const syncChecks = [checkAmountThreshold, checkRiskLevel, checkTxConfirmation];
  for (const check of syncChecks) {
    const reason = check(proposal);
    if (reason) reasons.push(reason);
  }

  const asyncChecks = [checkFraudSignals, checkAccountStatus];
  for (const check of asyncChecks) {
    try {
      const reason = await check(proposal);
      if (reason) reasons.push(reason);
    } catch (err) {
      reasons.push(`policy check '${check.name}' failed to run: ${err.message}`);
    }
  }

  return {
    decision: reasons.length === 0 ? 'AUTO_APPROVED' : 'NEED_APPROVAL',
    reasons,
  };
}

export default { evaluateCorrection };
