import express from 'express';
import ledgerEngine from '../../core/ledgerEngine.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * CREDIT (admin or system)
 */
router.post('/credit', requireAuth, async (req, res) => {
  try {
    const { amount } = req.body;

    const result = await ledgerEngine.credit({
      userId: req.user.id,
      amount: Number(amount),
      referenceId: `CREDIT-${Date.now()}`,
      description: 'Internal credit'
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DEBIT (spend funds)
 */
router.post('/debit', requireAuth, async (req, res) => {
  try {
    const { amount } = req.body;

    const result = await ledgerEngine.debit({
      userId: req.user.id,
      amount: Number(amount),
      referenceId: `DEBIT-${Date.now()}`,
      description: 'Internal debit'
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * BALANCE
 */
router.get('/balance', requireAuth, async (req, res) => {
  try {
    const balance = await ledgerEngine.getBalance(req.user.id);
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
