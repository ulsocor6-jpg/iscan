import express from 'express';
import crypto from 'crypto';
import treasuryCoordinator from '../services/treasury/treasuryCoordinator.js';
import { requireAuth, requireAdmin } from '../auth/middleware/authMiddleware.js';

const router = express.Router();

// ── POST /api/v1/treasury/report-balance ───────────────────────────────────
router.post('/report-balance', async (req, res) => {
  try {
    const { provider, balance, timestamp, signature } = req.body;
    if (!provider || balance == null || !timestamp || !signature) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const secret = process.env.ANDROID_PHP_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server secret not configured' });
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 60) {
      return res.status(403).json({ error: 'Timestamp too old – possible replay' });
    }

    const dataString = `${provider}|${balance}|${timestamp}`;
    const expected = crypto.createHmac('sha256', secret).update(dataString).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const accounts = await treasuryCoordinator.getLiveState('PHP');
    const target = accounts.find(a => a.provider === provider && a.isActive !== false);
    if (!target) {
      return res.status(404).json({ error: `No active treasury account for provider ${provider}` });
    }

    const newBalance = parseFloat(balance);
    await treasuryCoordinator.updatePhysicalBalance(target.id, newBalance, 'android-watcher');

    res.json({ success: true, provider, previousBalance: target.physicalBalance, newBalance });
  } catch (err) {
    console.error('[Watcher] Balance report failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/v1/treasury/report-balance-manual ─────────────────────────────
router.post('/report-balance-manual', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { provider, balance } = req.body;
    if (!provider || balance == null) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const parsedBalance = parseFloat(balance);
    if (Number.isNaN(parsedBalance) || parsedBalance < 0) {
      return res.status(400).json({ error: 'Invalid balance' });
    }

    const accounts = await treasuryCoordinator.getLiveState('PHP');
    const target = accounts.find(a => a.provider === provider && a.isActive !== false);
    if (!target) {
      return res.status(404).json({ error: `No active treasury account for provider ${provider}` });
    }

    const source = `manual:${req.user?.email || req.user?.id || 'unknown-admin'}`;
    await treasuryCoordinator.updatePhysicalBalance(target.id, parsedBalance, source);

    res.json({ success: true, provider, previousBalance: target.physicalBalance, newBalance: parsedBalance });
  } catch (err) {
    console.error('[Watcher] Manual balance report failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
