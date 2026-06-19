import express from 'express';
import requireAuth, { requireAdmin } from '../middleware/authMiddleware.js';
import {
  uploadID,
  uploadSelfie,
  getKYCStatus,
  adminApproveKYC,
  adminRejectKYC,
  adminListPendingKYC,
} from '../controllers/kycController.js';

const router = express.Router();

// ── User routes ────────────────────────────────────────────────────────────
router.get('/status',         requireAuth, getKYCStatus);
router.post('/upload-id',     requireAuth, uploadID);
router.post('/upload-selfie', requireAuth, uploadSelfie);

// ── Admin routes ───────────────────────────────────────────────────────────
router.get('/admin/pending',  requireAuth, requireAdmin, adminListPendingKYC);
router.post('/admin/approve', requireAuth, requireAdmin, adminApproveKYC);
router.post('/admin/reject',  requireAuth, requireAdmin, adminRejectKYC);

export default router;
