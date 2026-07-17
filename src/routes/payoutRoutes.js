import express from "express";
import { createPayout, getMyPayouts, adminCompletePayouts, adminCancelPayout, adminGetAllPayouts } from "../controllers/payoutController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/request", requireAuth, createPayout);
router.get("/my", requireAuth, getMyPayouts);

// Admin routes
router.post("/admin/complete", requireAuth, requireAdmin, adminCompletePayouts);
router.post("/admin/cancel", requireAuth, requireAdmin, adminCancelPayout);
router.get("/admin/all", requireAuth, requireAdmin, adminGetAllPayouts);

export default router;
