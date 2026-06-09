import express from 'express';
import { linkWallet, getWallets, unlinkWallet } from '../controllers/walletController.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import Wallet from '../models/walletModel.js';

const router = express.Router();

router.post('/link', requireAuth, linkWallet);
router.post('/unlink', requireAuth, unlinkWallet);
router.get('/list', requireAuth, getWallets);
router.get('/status', (req, res) => res.json({ success: true }));

// Save on-chain balance after connect
router.post('/balance', requireAuth, async (req, res) => {
  try {
    const { address, ethBalance } = req.body;
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const linked = wallet.linkedWallets.find(w => w.address.toLowerCase() === address.toLowerCase());
    if (linked) { linked.ethBalance = ethBalance; await wallet.save(); }
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: 'Failed to save balance' });
  }
});

export default router;
