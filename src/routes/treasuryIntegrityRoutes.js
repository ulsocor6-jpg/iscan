import express from 'express';
import treasuryIntegrityEngine from '../intelligence/treasuryIntegrityEngine.js';
import TreasurySnapshot from '../models/TreasurySnapshot.js';
import { requireAuth, requireAdmin } from '../auth/middleware/authMiddleware.js';

const router = express.Router();

// Laptop verifier submits proof
router.post('/laptop-proof', requireAuth, async (req, res) => {
  try {
    const { pool, actualBalance, timestamp, signature, verifierId } = req.body;
    if (!pool || actualBalance === undefined) {
      return res.status(400).json({ error: 'Missing pool or actualBalance' });
    }
    const snapshot = await treasuryIntegrityEngine.receiveLaptopProof({
      pool, actualBalance, timestamp, signature, verifierId: verifierId || req.user._id,
    });
    res.json({ success: true, snapshot });
  } catch (err) {
    console.error('[LaptopProof]', err);
    res.status(500).json({ error: err.message });
  }
});

// Get current treasury state for a pool
router.get('/state/:pool', requireAuth, async (req, res) => {
  try {
    const state = await treasuryIntegrityEngine.getOrCreateState(req.params.pool);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get integrity snapshots
router.get('/snapshots/:pool', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const snapshots = await TreasurySnapshot.find({ pool: req.params.pool }).sort({ createdAt: -1 }).limit(limit);
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
