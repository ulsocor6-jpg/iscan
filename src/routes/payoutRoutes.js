import express from "express";
import { createPayout, getMyPayouts, adminCompletePayouts, adminCancelPayout, adminGetAllPayouts } from "../controllers/payoutController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/request", requireAuth, createPayout);
router.get("/my", requireAuth, getMyPayouts);

// Admin routes
router.post("/admin/complete", requireAuth, adminCompletePayouts);
router.post("/admin/cancel", requireAuth, adminCancelPayout);
router.get("/admin/all", requireAuth, adminGetAllPayouts);

export default router;
