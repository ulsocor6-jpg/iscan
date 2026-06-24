import express from 'express';
import { linkWallet, getWallets, unlinkWallet, switchChain, getAllWalletsAdmin } from '../controllers/walletController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { getUserBalance } from '../services/balanceService.js';
import mongoose from 'mongoose';
import Ledger from '../models/ledgerModel.js';
import Wallet from '../models/walletModel.js';

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

router.get('/balances', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await Ledger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$currency', credit: { $sum: { $ifNull: ['$credit', 0] } }, debit: { $sum: { $ifNull: ['$debit', 0] } } } }
    ]);
    const balances = {};
    result.forEach(a => { balances[a._id] = a.credit - a.debit; });
    return res.json({ success: true, balances });
  } catch (err) {
    console.error('[BALANCES ERROR]', err);
    return res.status(500).json({ message: 'Could not fetch balances.' });
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

// POST /api/v1/wallet/notify-transfer
// Called after user sends tx from external wallet — logs it for the listener to pick up
router.post('/notify-transfer', requireAuth, async (req, res) => {
  try {
    const { txHash, token, amount, chain, fromAddress } = req.body;
    console.log(`[WALLET] Transfer notified: ${amount} ${token} on ${chain} from ${fromAddress} tx=${txHash}`);
    // The baseListener/roninListener will detect the balance change automatically
    // This just logs it for audit purposes
    res.json({ success: true, message: 'Transfer noted — balance will update once confirmed on-chain' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
