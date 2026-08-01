import express from "express";
import { rebalance, createSweepIntent, listSweepIntents } from "../controllers/adminTreasuryController.js";
import { requireAuth, requireAdmin } from "../auth/middleware/authMiddleware.js";

const router = express.Router();

router.get("/sweep-intents", requireAuth, requireAdmin, listSweepIntents);
router.post("/rebalance", requireAuth, requireAdmin, rebalance);
router.post("/sweep-intent", requireAuth, requireAdmin, createSweepIntent);

export default router;
