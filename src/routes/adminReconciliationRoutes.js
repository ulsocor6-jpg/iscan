import express from 'express';
import { listReconciliation, getReconciliationForUser } from '../controllers/adminReconciliationController.js';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// By default only returns users with a mismatch — pass ?onlyMismatches=false
// to see everyone, including users already in sync.
router.get('/', requireAuth, requireAdmin, listReconciliation);
router.get('/:userId', requireAuth, requireAdmin, getReconciliationForUser);

export default router;
