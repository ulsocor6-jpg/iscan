/**
 * ⚠️ RESERVED — NOT CURRENTLY MOUNTED IN app.js ⚠️
 *
 * This route self-completes PHP withdrawals via phpExecutionDispatcher
 * without any human confirmation step — for GCash/Bank/MariBank it marks
 * the withdrawal "completed" the instant a command is *queued*
 * (OutboundCommand created), not when anyone has actually verified money
 * left the account. That does not match how this system operates today:
 * every PHP withdrawal must be manually disbursed and confirmed by an
 * operator via the Cashouts admin dashboard.
 *
 * The live PHP withdrawal path is paymentRoutes.js's POST /cashout
 * (mounted at /api/v1/payment/cashout), which:
 *   - debits atomically
 *   - creates a WithdrawalRequest with status: 'pending_review'
 *   - alerts the operator via Telegram (alertCashoutAwaitingRelease)
 *   - only marks status 'completed' when an operator hits Approve on
 *     /api/v1/admin/withdrawals/:id/approve after actually sending the
 *     money by hand
 *
 * Keep this file for future use: once a real, confirmed disbursement API
 * (GCash/Maya/bank payout API with an actual success callback) is
 * integrated, this dispatcher pattern is the starting point for
 * retiring manual disbursement. Until then, do not re-mount it in
 * app.js — see the comment left there for context.
 */

import express from 'express';
import { requireAuth } from '../auth/middleware/authMiddleware.js';
import allocationEngine from '../services/treasury/allocationEngine.js';
import ledgerEngine from '../../core/ledgerEngine.js';
import eventStreamService from '../services/eventStreamService.js';
import phpExecutionDispatcher from '../services/execution/phpExecutionDispatcher.js';
import crypto from 'crypto';

const router = express.Router();

// ── POST /api/v1/withdraw/request ──────────────────────────────────────────
router.post('/request', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, channel, destination } = req.body; // channel: 'MAYA','GCASH','BANK'; destination: phone/account number

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!destination) {
      return res.status(400).json({ error: 'Destination (phone number or account number) is required' });
    }

    const validChannels = ['MAYA', 'GCASH', 'BANK', 'MARIBANK'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({ error: `Invalid channel. Use one of: ${validChannels.join(', ')}` });
    }

    // Map front-end channel to internal provider key
    const providerMap = { MAYA: 'maya', GCASH: 'gcash', BANK: 'bank_bpi', MARIBANK: 'maribank' };
    const provider = providerMap[channel];

    // 1. Check user's ledger balance
    const balance = await ledgerEngine.getBalance(userId, 'PHP');
    if (balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // 2. Try to allocate a treasury account with enough liquidity
    let allocation;
    try {
      allocation = await allocationEngine.allocate({
        userId,
        provider,
        amount,
        currency: 'PHP',
        ttlMinutes: 15,
      });
    } catch (allocErr) {
      // Fetch live state to suggest alternatives
      const treasuryCoordinator = (await import('../services/treasury/treasuryCoordinator.js')).default;
      const liveState = await treasuryCoordinator.getLiveState('PHP');
      const alternatives = liveState
        .filter(a => a.available >= amount)
        .map(a => a.provider);

      return res.status(422).json({
        error: allocErr.message,
        maxAvailableForProvider: liveState
          .filter(a => a.provider === provider)
          .reduce((max, a) => Math.max(max, a.available), 0),
        suggestedAlternatives: alternatives,
      });
    }

    // 3. Debit the user's ledger immediately (same as existing PHP cashout)
    const referenceId = 'WD-' + crypto.randomBytes(6).toString('hex');
    const fee = amount * 0.015; // 1.5%
    const net = amount - fee;

    await ledgerEngine.debit({
      userId,
      amount,
      currency: 'PHP',
      referenceId,
      description: `Withdrawal via ${channel}`,
    });

    // 4. Update reservation with the real referenceId
    allocation.reservation.referenceId = referenceId;
    await allocation.reservation.save();

    // 5. Execute the withdrawal via the dispatcher
    try {
      await phpExecutionDispatcher.dispatch({
        userId,
        referenceId,
        amount,
        netAmount: net,
        channel,
        destination,
        reservationId: allocation.reservation.reservationId,
        treasuryAccountId: allocation.account.id,
      });

      // Success — reservation already consumed inside dispatcher
      return res.json({
        success: true,
        referenceId,
        amount,
        fee,
        netAmount: net,
        status: 'completed',
        message: `Withdrawal sent — ₱${net.toFixed(2)} to your ${channel} account.`,
      });
    } catch (dispatchErr) {
      // Dispatch failed — reservation released inside dispatcher, but user still debited
      eventStreamService.emit('withdrawal.failed', {
        entityId: referenceId,
        userId,
        amount,
        channel,
        error: dispatchErr.message,
      });

      return res.status(502).json({
        error: `Funds debited but send failed: ${dispatchErr.message}. Admin review required.`,
        referenceId,
        status: 'failed_dispatch',
      });
    }
  } catch (err) {
    console.error('[Withdrawal] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
