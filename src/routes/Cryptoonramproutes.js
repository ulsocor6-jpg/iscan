/**
 * cryptoOnrampRoutes.js
 * Routes for USDC/USDT → PHP conversion
 *
 * Place at: src/routes/cryptoOnrampRoutes.js
 *
 * Then in app.js / server.js add:
 *   import onrampRoutes from './src/routes/cryptoOnrampRoutes.js';
 *   app.use('/api/v1/onramp', onrampRoutes);
 */

import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  getQuote,
  initiateConversion,
  getOnrampHistory,
} from '../controllers/cryptoOnrampController.js';

const router = express.Router();

// Public rate quote (auth optional but good practice)
router.get('/rate',     requireAuth, getQuote);

// Initiate conversion (auth required)
router.post('/convert', requireAuth, initiateConversion);

// History
router.get('/history',  requireAuth, getOnrampHistory);

export default router;
