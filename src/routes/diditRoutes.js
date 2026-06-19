import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  createVerificationSession,
  handleDiditWebhook,
  getSessionDecision,
} from '../controllers/diditController.js';

const router = express.Router();

router.post('/verify', requireAuth, createVerificationSession);
router.get('/decision/:sessionId', requireAuth, getSessionDecision);
router.post('/webhook', handleDiditWebhook);

export default router;
