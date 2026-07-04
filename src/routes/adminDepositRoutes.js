import express from "express";
import {
  listPending,
  approveDeposit
} from "../controllers/adminDepositController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/pending", requireAuth, requireAdmin, listPending);
router.post("/:id/approve", requireAuth, requireAdmin, approveDeposit);

export default router;
