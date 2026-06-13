import express from 'express';
import {
  linkWallet,
  getWallets,
  unlinkWallet,
  getWalletMe,
  getWalletBalance
} from '../controllers/walletController.js';

import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/link', requireAuth, linkWallet);
router.post('/unlink', requireAuth, unlinkWallet);

router.get('/list', requireAuth, getWallets);
router.get('/me', requireAuth, getWalletMe);
router.get('/balance', requireAuth, getWalletBalance);

router.get('/status', (req, res) => {
  res.json({ success: true });
});

export default router;
