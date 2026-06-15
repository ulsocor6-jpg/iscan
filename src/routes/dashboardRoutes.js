import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import dashboardService from "../services/dashboardService.js";
import { getDashboard } from "../controllers/dashboardController.js";

const router = express.Router();

/*
 USER DASHBOARD
*/
router.get(
  "/",
  requireAuth,
  getDashboard
);

/*
 ADMIN DASHBOARD
*/
router.get(
  "/overview",
  async (req, res) => {
    try {

      const overview =
        await dashboardService.getOverview();

      res.json({
        success: true,
        data: overview
      });

    } catch (err) {

      res.status(500).json({
        success: false,
        error: err.message
      });

    }
  }
);

router.get(
  "/risk",
  async (req, res) => {
    try {

      const signals =
        await dashboardService.getRiskSignals();

      res.json({
        success: true,
        data: signals
      });

    } catch (err) {

      res.status(500).json({
        success: false,
        error: err.message
      });

    }
  }
);

router.get(
  "/health",
  async (req, res) => {
    try {

      const health =
        await dashboardService.getHealth();

      res.json({
        success: true,
        data: health
      });

    } catch (err) {

      res.status(500).json({
        success: false,
        error: err.message
      });

    }
  }
);

export default router;
