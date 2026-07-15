// src/routes/reconciliation/reconciliationRoutes.js
//
// Mount in app.js/server.js alongside your other admin routes, e.g.:
//   import reconciliationRoutes from './src/routes/reconciliation/reconciliationRoutes.js';
//   app.use('/api/v1/admin/reconciliation', reconciliationRoutes);
//
// All routes here are admin-only (requireAuth + requireAdmin), matching
// the pattern already used in dashboardRoutes.js for the /overview,
// /risk, /health, /stream admin endpoints.

import express from 'express';
import { requireAuth, requireAdmin } from '../../middleware/authMiddleware.js';
import {
  runForUserHandler,
  runForAllUsersHandler,
  listQueueHandler,
  approveHandler,
  rejectHandler,
} from '../../controllers/reconciliation/reconciliationController.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

// "Run Full Correction" button - single user
router.post('/run/:userId', runForUserHandler);

// "Run Full Correction" button - platform-wide
router.post('/run-all', runForAllUsersHandler);

// Correction Queue - human review inbox for NEED_APPROVAL / RISK_DRIFT items
router.get('/queue', listQueueHandler);
router.post('/queue/:id/approve', approveHandler);
router.post('/queue/:id/reject', rejectHandler);

export default router;
