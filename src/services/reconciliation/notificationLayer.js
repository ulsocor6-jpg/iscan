// src/services/reconciliation/notificationLayer.js
//
// Three audiences from the diagram: User ("Balance adjusted"), Operator
// ("Correction completed"), Compliance ("Audit event").
//
// I don't have visibility into your existing Telegram alert service (the
// one with the dotenv duplicate-key bug you fixed), so these are stub
// adapters that log via inspector + console for now. Wire your real
// senders into the three `send*` functions below - the call sites in
// ledgerCorrectionEngine.js and reconciliationEngine.js won't need to
// change.

import inspector from '../blockchain/inspector/blockchainInspector.js';

async function sendUserNotification(userId, payload) {
  // TODO: plug in your in-app notification / push service here.
  inspector.info('reconciliation:notify:user', `Notifying user ${userId}`, payload);
}

async function sendOperatorNotification(payload) {
  // TODO: plug in your Telegram alert service here, e.g.:
  // await telegramAlertService.send(`[Reconciliation] ${payload.type} - ${JSON.stringify(payload)}`);
  inspector.info('reconciliation:notify:operator', 'Notifying operator', payload);
}

async function sendComplianceNotification(payload) {
  // TODO: route to wherever compliance audit events land (could just be
  // the ReconciliationAudit collection itself, already written by
  // transactionFinalizer.recordAudit - this hook is for anything that
  // ALSO needs a push, e.g. a compliance Slack/Telegram channel).
  inspector.info('reconciliation:notify:compliance', 'Compliance audit event', payload);
}

export async function notifyUser(userId, payload) {
  try { await sendUserNotification(userId, payload); }
  catch (err) { console.error('[reconciliation] notifyUser failed:', err.message); }
}

export async function notifyOperator(payload) {
  try { await sendOperatorNotification(payload); }
  catch (err) { console.error('[reconciliation] notifyOperator failed:', err.message); }
}

export async function notifyCompliance(payload) {
  try { await sendComplianceNotification(payload); }
  catch (err) { console.error('[reconciliation] notifyCompliance failed:', err.message); }
}

export default { notifyUser, notifyOperator, notifyCompliance };
