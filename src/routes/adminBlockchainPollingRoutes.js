import express from "express";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";
import {
  getPollingState,
  setPollingOverride,
  clearPollingOverride,
  setPollingBounds,
  getUsageSnapshot,
} from "../controllers/adminBlockchainPollingController.js";

const router = express.Router();

router.get("/polling", requireAuth, requireAdmin, getPollingState);
router.post("/polling/:chain/override", requireAuth, requireAdmin, setPollingOverride);
router.delete("/polling/:chain/override", requireAuth, requireAdmin, clearPollingOverride);
router.post("/polling/:chain/bounds", requireAuth, requireAdmin, setPollingBounds);

router.get("/usage", requireAuth, requireAdmin, getUsageSnapshot);

export default router;
