import express from 'express';
import { linkWallet, getWallets, unlinkWallet, switchChain, getAllWalletsAdmin } from '../controllers/walletController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { getUserBalance } from '../services/balanceService.js';

const router = express.Router();

router.get('/balance', requireAuth, async (req, res) => {
  try {
    const balance = await getUserBalance(req.user.id);
    return res.json({ success: true, balance });
  } catch (err) {
    console.error('[BALANCE ERROR]', err);
    return res.status(500).json({ message: 'Could not fetch balance.' });
  }
});

router.post('/link', requireAuth, linkWallet);
router.post('/unlink', requireAuth, unlinkWallet);
router.get('/list', requireAuth, getWallets);
router.post('/switch-chain', requireAuth, switchChain);
router.get('/status', (req, res) => res.json({ success: true }));

// ─── ADMIN: Treasury — list ALL platform wallets ─────────────────────────────
router.get('/admin/list', requireAuth, requireAdmin, getAllWalletsAdmin);

export default router;
