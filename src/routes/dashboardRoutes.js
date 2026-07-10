import express from "express";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import dashboardService from "../services/dashboardService.js";
import { getDashboard } from "../controllers/dashboardController.js";
import eventStreamService from "../services/eventStreamService.js";

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

// SSE — Admin real-time event stream
router.get("/stream", requireAuth, requireAdmin, (req, res) => {

  console.log(
    "[SSE] Stream opened by",
    req.user?.email || req.user?.id || "unknown"
  );
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  // Register this admin as a live SSE client
  eventStreamService.addAdminClient(res);

  req.on("close", () => {
    clearInterval(heartbeat);
  });
});
