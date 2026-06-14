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

router.get('/rate',                      requireAuth, getQuote);
router.post('/deposit-address',          requireAuth, createDepositAddress);
router.get('/deposit-status/:depositId', requireAuth, getDepositStatus);
router.post('/convert',                  requireAuth, initiateConversion);
router.get('/history',                   requireAuth, getOnrampHistory);

export default router;
