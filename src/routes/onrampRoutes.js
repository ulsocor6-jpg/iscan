import express from 'express';
import { createOnrampOrder } from '../controllers/onrampController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * CREATE ONRAMP ORDER
 */
router.post('/create', requireAuth, createOnrampOrder);

/**
 * LIVE FX RATE (FIX FOR FRONTEND 404)
 */
router.get('/rate', requireAuth, async (req, res) => {
  try {
    const { token = 'USDC', channel = 'maya', amount = 1 } = req.query;

    // temporary safe rates (replace later with FX engine)
    const rates = {
      USDC: 1,
      USDT: 1,
      ETH: 180000,
      BTC: 3500000,
      PHP: 1
    };

    const rate = rates[token.toUpperCase()] || null;

    if (!rate) {
      return res.status(400).json({
        success: false,
        message: `Unsupported token: ${token}`
      });
    }

    const phpAmount = Number(amount) * rate;

    return res.json({
      success: true,
      data: {
        token,
        channel,
        amount: Number(amount),
        rate,
        phpAmount
      }
    });

  } catch (err) {
    console.error('[ONRAMP RATE ERROR]', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch rate'
    });
  }
});

export default router;
