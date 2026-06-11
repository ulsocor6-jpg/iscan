import express from 'express';
import { createOnrampOrder } from '../controllers/onrampController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/create', requireAuth, createOnrampOrder);

export default router;
