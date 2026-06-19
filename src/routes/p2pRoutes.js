import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requireFullKYC } from '../middleware/kycTierMiddleware.js';
import { transfer } from '../services/p2pTransferService.js';

const router = express.Router();

router.post('/send', requireAuth, requireFullKYC, async (req, res) => {
  try {
    const { receiverId, amount } = req.body;

    const referenceId = `P2P-${Date.now()}`;

    const tx = await transfer({
      senderId: req.user.id,
      receiverId,
      amount,
      referenceId
    });

    res.json({
      success: true,
      tx
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
