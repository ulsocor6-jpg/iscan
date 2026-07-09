import express from 'express';
import crypto from 'crypto';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import DirectDeposit from '../models/DirectDepositModel.js';
import User from '../models/userModel.js';
import BankAccount from '../models/BankAccount.js';
import walletService from '../services/walletService.js';
import inspectorService from '../services/inspectorService.js';
import { InspectorStage } from '../inspector/inspectorConstants.js';
import BlockchainInbox from '../models/blockchain/blockchainInboxModel.js';

const router = express.Router();

// ── POST /deposit/request ──────────────────────────────────────────────────
// User initiates a deposit request. For MAYA channel, they must have a linked
// Maya number on file — this is what the verifier uses to auto-match incoming
// payments. Without it, auto-credit is impossible.
router.post('/request', requireAuth, async (req, res) => {
  try {
    console.log("=== /deposit/request HIT ===");
    console.log("[DepositRequest] Body:", req.body);
    console.log("[DepositRequest] User:", req.user?.id);
    const { amount, channel = 'GCASH' } = req.body;

    const php = parseFloat(amount);
    if (!php || php < 20)      return res.status(400).json({ error: 'Minimum deposit is ₱20' });
    if (php > 100000)          return res.status(400).json({ error: 'Maximum deposit is ₱100,000' });

    const validChannels = ['GCASH', 'MAYA', 'BANK'];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({ error: `Invalid channel. Must be one of: ${validChannels.join(', ')}` });
    }

    // ── Maya channel: verify the user has a linked Maya number ────────────
    if (channel === 'MAYA') {
      const linkedMaya = await BankAccount.findOne({
        userId: req.user.id,
        provider: 'maya'
      }).lean();

      if (!linkedMaya) {
        return res.status(400).json({
          error: 'No linked Maya account found. Please link your Maya number in your profile before depositing via Maya.',
          code: 'NO_LINKED_MAYA_ACCOUNT',
        });
      }
    }

    const existingDeposit = await DirectDeposit.findOne({
      userId: req.user.id,
      channel,
      status: "PENDING",
      expiresAt: { $gt: new Date() }
    });

    if (existingDeposit) {
      return res.json({
        success: true,
        existing: true,
        referenceId: existingDeposit.referenceId,
        amount: existingDeposit.amount,
        channel: existingDeposit.channel,
        expiresAt: existingDeposit.expiresAt,
        instructions: {
          gcash: process.env.GCASH_NUMBER || "Not configured",
          maya:  process.env.MAYA_NUMBER  || "Not configured",
          bank:  process.env.BANK_ACCOUNT || "Not configured",
          name:  process.env.ACCOUNT_NAME || "ISCAN",
          message: `Send exactly ₱ — Reference: `,
        }
      });
    }

    // ── Generate reference ID (audit trail, shown on QR) ─────────────────
    const referenceId = 'ISCAN-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    const deposit = await DirectDeposit.create({
      userId: req.user.id,
      referenceId,
      amount: php,
      channel,
    });

    // Start the visual pipeline now — this is stage 0, before any bank
    // email/notification has arrived. The MariBank listener will look up
    // this same flow by referenceId and continue it once the email lands.
    try {
      const flow = await inspectorService.startFlow({
        pipeline: 'PHP_DEPOSIT',
        source: channel,
        transactionType: 'cashin',
        referenceId,
        amount: php,
      });
      await inspectorService.startStage(flow.flowId, InspectorStage.DEPOSIT_REQUESTED, {
        userId: req.user.id,
        channel,
        amount: php,
      });
      await inspectorService.finishStage(flow.flowId, InspectorStage.DEPOSIT_REQUESTED, {
        result: { referenceId, amount: php, channel },
        decision: { reason: 'DEPOSIT_REQUEST_CREATED' },
      });
    } catch (inspectorErr) {
      // Never let Inspector tracking break the actual deposit flow.
      console.error('[Inspector] Failed to start flow for deposit request:', inspectorErr.message);
    }

    res.json({
      success: true,
      referenceId,
      amount: php,
      channel,
      expiresAt: deposit.expiresAt,
      instructions: {
        gcash:   process.env.GCASH_NUMBER  || 'Not configured',
        maya:    process.env.MAYA_NUMBER   || 'Not configured',
        bank:    process.env.BANK_ACCOUNT  || 'Not configured',
        name:    process.env.ACCOUNT_NAME  || 'ISCAN',
        message: `Send exactly ₱${php} — Reference: ${referenceId}`,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/status/:referenceId ──────────────────────────────────────
router.get('/status/:referenceId', requireAuth, async (req, res) => {
  try {
    const deposit = await DirectDeposit.findOne({
      referenceId: req.params.referenceId,
      userId: req.user.id,
    });
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    res.json({ success: true, deposit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/admin/pending ─────────────────────────────────────────────
router.get('/admin/pending', requireAuth, requireAdmin, async (req, res) => {
  try {
    const deposits = await DirectDeposit.find({ status: 'PENDING' })
      .populate('userId', 'email firstName lastName linkedWallets')
      .sort({ createdAt: -1 });
    res.json({ success: true, deposits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /deposit/admin/confirm ────────────────────────────────────────────
// Manual admin credit — used when auto-matching fails or is ambiguous.
// Atomic findOneAndUpdate prevents double-credit even if admin clicks twice.
router.post('/admin/confirm', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { referenceId, senderName, adminNote } = req.body;

    const deposit = await DirectDeposit.findOneAndUpdate(
      { referenceId, status: 'PENDING' },
      { status: 'CREDITED', creditedAt: new Date(), senderName, adminNote },
      { new: false }
    );

    if (!deposit) {
      const existing = await DirectDeposit.findOne({ referenceId });
      if (!existing) return res.status(404).json({ error: 'Deposit not found' });
      return res.status(400).json({ error: `Deposit already ${existing.status.toLowerCase()}` });
    }

    try {
      await walletService.credit(deposit.userId.toString(), 'PHP', deposit.amount, {
        referenceId,
        description: `Manual deposit confirm via ${deposit.channel} from ${senderName || 'unknown'} (admin)`,
        transactionType: 'cashin',
      });
    } catch (ledgerErr) {
      await DirectDeposit.findOneAndUpdate({ referenceId }, { status: 'PENDING' });
      throw ledgerErr;
    }

    console.log(`[DEPOSIT] Admin confirmed ₱${deposit.amount} for user ${deposit.userId} ref:${referenceId}`);
    res.json({ success: true, credited: deposit.amount, referenceId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /deposit/admin/cancel ─────────────────────────────────────────────
router.post('/admin/cancel', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { referenceId, reason } = req.body;
    const deposit = await DirectDeposit.findOneAndUpdate(
      { referenceId },
      { status: 'EXPIRED', adminNote: reason },
      { new: true }
    );
    if (!deposit) return res.status(404).json({ error: 'Deposit not found' });
    res.json({ success: true, deposit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/pending ───────────────────────────────────────────────────
// Restores the current user's in-flight PENDING deposit (if any) after a
// page refresh. Without this, the frontend has no way to know a deposit
// is still open server-side, and just shows a fresh Cash In form instead
// of the QR code / reference / Cancel button for the existing request.
router.get('/pending', requireAuth, async (req, res) => {
  try {
    const deposit = await DirectDeposit.findOne({
      userId: req.user.id,
      status: 'PENDING',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 }).lean();

    res.json({ deposit: deposit || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /deposit/cancel ───────────────────────────────────────────────────
// User cancels their own PENDING deposit request. Unlike admin/cancel, this
// only allows a user to cancel a deposit that belongs to them and is still
// PENDING — prevents cancelling deposits that already got credited, and
// prevents cancelling someone else's request by referenceId guessing.
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { referenceId } = req.body;
    if (!referenceId) return res.status(400).json({ error: 'referenceId is required' });

    const deposit = await DirectDeposit.findOneAndUpdate(
      { referenceId, userId: req.user.id, status: 'PENDING' },
      { status: 'CANCELLED', cancelledAt: new Date() },
      { new: true }
    );

    if (!deposit) {
      return res.status(404).json({ error: 'No cancellable PENDING deposit found with that reference' });
    }

    // Close out the Inspector flow so it doesn't sit at RUNNING forever
    try {
      const flow = await inspectorService.findRunningByReference(referenceId);
      if (flow) {
        await inspectorService.startStage(flow.flowId, "CANCELLED", { by: req.user.id });
        await inspectorService.finishStage(flow.flowId, "CANCELLED", {
          decision: { reason: "USER_CANCELLED" },
        });
        await inspectorService.finishFlow(flow.flowId);
      }
    } catch (inspectorErr) {
      console.error("[deposit/cancel] Failed to close inspector flow:", inspectorErr.message);
    }

    console.log(`[DEPOSIT] User ${req.user.id} cancelled deposit ref:${referenceId}`);
    res.json({ success: true, deposit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/admin/logs ────────────────────────────────────────────────
// FIX #11: Moved above export default — these were previously unreachable
// because they were defined after the export statement.
router.get('/admin/logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const deposits = await DirectDeposit.find()
      .populate('userId', 'email firstName lastName')
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json({ success: true, deposits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/admin/flagged ─────────────────────────────────────────────
router.get('/admin/flagged', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: DepositReview } = await import('../models/depositReviewModel.js');
    const reviews = await DepositReview.find({ status: 'pending_review' })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/admin/ingress ─────────────────────────────────────────────
router.get('/admin/ingress', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { default: IngressEvent } = await import('../models/IngressEvent.js');
    const events = await IngressEvent.find()
      .sort({ receivedAt: -1 })
      .limit(100);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /deposit/crypto/processing ─────────────────────────────────────────
// Returns the current user's in-flight crypto deposits — detected on-chain
// but not yet fully credited to Ledger. Powers the Confirmation Zone view.
router.get('/crypto/processing', requireAuth, async (req, res) => {
  try {
    const jobs = await BlockchainInbox.find({
      'watch.userId': req.user.id,
      status: { $ne: 'FAILED' },
      'workers.ledger.done': false,
    })
      .sort({ blockNumber: 1 })
      .lean();

    const processing = jobs.map((j) => ({
      txHash: j.txHash,
      chain: j.chain,
      token: j.token,
      amount: j.value,
      confirmations: j.confirmations,
      requiredConfirmations: j.requiredConfirmations,
      currentStage: j.currentStage,
      status: j.status,
      detectedAt: j.createdAt,
    }));

    res.json({ success: true, processing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
