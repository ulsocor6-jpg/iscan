import express from 'express';
import { quoteSwap, executeSwap, poolStatus } from '../controllers/phpSwapController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/quote',  protect, quoteSwap);
router.post('/execute', protect, executeSwap);
router.get('/pool',   protect, poolStatus);

export default router;
