import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  getQuote,
  initiateConversion,
  getOnrampHistory,
  createDepositAddress,
  getDepositStatus,
} from '../controllers/cryptoOnrampController.js';

const router = express.Router();

// Live rate quote
router.get('/rate',           requireAuth, getQuote);

// Generate deposit wallet address (replaces manual txHash flow)
router.post('/deposit-address', requireAuth, createDepositAddress);

// Poll deposit detection status (frontend calls every 8s)
router.get('/deposit-status/:depositId', requireAuth, getDepositStatus);

// Initiate conversion + payout
router.post('/convert',       requireAuth, initiateConversion);

// History
router.get('/history',        requireAuth, getOnrampHistory);

export default router;
