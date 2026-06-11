import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import dashboardService from '../services/dashboardService.js';

const router = express.Router();

/**
 * GET /api/v1/dashboard/overview
 * System-wide transaction stats — used by admin panel
 */
router.get('/overview', requireAuth, async (req, res) => {
  try {
    const overview = await dashboardService.getOverview();
    res.json({ success: true, data: overview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/dashboard/risk
 * Last-hour fraud signals
 */
router.get('/risk', requireAuth, async (req, res) => {
  try {
    const signals = await dashboardService.getRiskSignals();
    res.json({ success: true, data: signals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/dashboard/health
 * System health check
 */
router.get('/health', requireAuth, async (req, res) => {
  try {
    const health = await dashboardService.getHealth();
    res.json({ success: true, data: health });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
