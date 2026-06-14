import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { swapUSDtoPHP } from '../controllers/swapController.js';

const router = express.Router();

/**
 * POST /api/v1/swap/php
 * Body: { amount: Number, currency: 'USD' | 'USDT' | ... }
 * Converts foreign currency to PHP via fxEngine → swapService → ledger
 */
router.post('/php', requireAuth, swapUSDtoPHP);

export default router;
