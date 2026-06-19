import express from 'express';
import { quoteSwap, executeSwap, poolStatus } from '../controllers/phpSwapController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/quote',  quoteSwap);
router.post('/execute', requireAuth, executeSwap);
router.get('/pool',   poolStatus);

export default router;
