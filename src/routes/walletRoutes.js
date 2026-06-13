import express from 'express';
import { linkWallet, getWallets, unlinkWallet } from '../controllers/walletController.js';
import { requireAuth } from '../middleware/authMiddleware.js'; // ← FIXED: was ../../middleware (wrong depth)
import { getUserBalance } from '../services/balanceService.js'; // ← ADD: wire in balanceService

const router = express.Router();

// ─── BALANCE ─────────────────────────────────────────────────────────────────
// This route was completely missing — the reason the frontend showed nothing.
// Uses balanceService (ledger sum) as source of truth.
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const balance = await getUserBalance(req.user.id);
    return res.json({ success: true, balance });
  } catch (err) {
    console.error('[BALANCE ERROR]', err);
    return res.status(500).json({ message: 'Could not fetch balance.' });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

router.post('/link', requireAuth, linkWallet);
router.post('/unlink', requireAuth, unlinkWallet);
router.get('/list', requireAuth, getWallets);
router.get('/status', (req, res) => res.json({ success: true }));

export default router;
