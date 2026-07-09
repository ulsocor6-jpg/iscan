// src/controllers/adminReconciliationController.js
import { reconcileUser, reconcileAllUsers } from '../services/reconciliationService.js';

// GET /api/v1/admin/reconciliation?onlyMismatches=true
export async function listReconciliation(req, res) {
  try {
    const onlyMismatches = req.query.onlyMismatches !== 'false'; // default true
    const reports = await reconcileAllUsers({ onlyMismatches });
    res.json({ success: true, count: reports.length, reports });
  } catch (err) {
    console.error('[AdminReconciliation] list failed:', err.message);
    res.status(500).json({ message: 'Could not compute reconciliation report.' });
  }
}

// GET /api/v1/admin/reconciliation/:userId
export async function getReconciliationForUser(req, res) {
  try {
    const report = await reconcileUser(req.params.userId);
    if (!report) return res.status(404).json({ message: 'No wallet found for this user.' });
    res.json({ success: true, report });
  } catch (err) {
    console.error('[AdminReconciliation] user lookup failed:', err.message);
    res.status(500).json({ message: 'Could not compute reconciliation report for this user.' });
  }
}
