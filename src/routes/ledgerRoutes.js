import express from 'express';

import {
getLedgerHistory
} from '../controllers/ledgerController.js';

import {
requireAuth
} from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get(
'/history',
requireAuth,
getLedgerHistory
);

export default router;

