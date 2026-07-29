import express from 'express';
import OutboundCommand from '../models/outboundCommandModel.js';
import treasuryCoordinator from '../services/treasury/treasuryCoordinator.js';
import eventStreamService from '../services/eventStreamService.js';
import { requireAuth, requireAdmin } from '../auth/middleware/authMiddleware.js';

const router = express.Router();

// ── GET /device-commands/next?provider=gcash ───────────────────────────────
router.get('/next', requireAuth, requireAdmin, async (req, res) => {
  const { provider } = req.query;
  if (!provider) return res.status(400).json({ error: 'provider required' });

  const cmd = await OutboundCommand.findOneAndUpdate(
    { provider, status: 'PENDING' },
    { status: 'EXECUTING', deviceId: req.headers['x-device-id'] || 'unknown' },
    { new: true, sort: { createdAt: 1 } }
  );

  if (!cmd) return res.json({ command: null });

  res.json({
    command: {
      commandId: cmd.commandId,
      provider: cmd.provider,
      account: cmd.account,
      amount: cmd.amount,
      referenceId: cmd.referenceId,
    },
  });
});

// ── POST /device-commands/:commandId/complete ──────────────────────────────
router.post('/:commandId/complete', requireAuth, requireAdmin, async (req, res) => {
  const { txHash, status } = req.body;
  const cmd = await OutboundCommand.findOne({ commandId: req.params.commandId });

  if (!cmd) return res.status(404).json({ error: 'Command not found' });
  if (cmd.status === 'COMPLETED') return res.json({ success: true, message: 'Already completed' });

  cmd.status = status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
  cmd.txHash = txHash || null;
  cmd.resultData = req.body.resultData || {};
  await cmd.save();

  if (status === 'COMPLETED') {
    try {
      const accounts = await treasuryCoordinator.getLiveState('PHP');
      const target = accounts.find(a => a.provider === cmd.provider && a.isActive);
      if (target) {
        await treasuryCoordinator.updatePhysicalBalance(
          target.id,
          Math.max(0, target.physicalBalance - cmd.amount),
          'withdrawal'
        );
      }
      eventStreamService.emit('withdrawal.completed', {
        entityId: cmd.referenceId,
        amount: cmd.amount,
        channel: cmd.provider,
        message: `Withdrawal sent via ${cmd.provider} – ₱${cmd.amount.toFixed(2)}`,
      });
    } catch (err) {
      console.error('[DeviceCommand] Deduction failed:', err.message);
    }
  }

  res.json({ success: true });
});

export default router;
