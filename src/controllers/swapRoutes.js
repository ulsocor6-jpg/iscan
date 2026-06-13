import express from 'express';

import {
  swapUSDtoPHP
} from '../controllers/swapController.js';

import {
  requireAuth
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.post(
  '/usd-to-php',
  requireAuth,
  swapUSDtoPHP
);

export default router;
