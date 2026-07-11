import express from "express";
import {
  listPendingWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  verifyCashout
} from "../controllers/adminWithdrawalController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/pending", requireAuth, requireAdmin, listPendingWithdrawals);
router.post("/:id/approve", requireAuth, requireAdmin, approveWithdrawal);
router.post("/:id/reject", requireAuth, requireAdmin, rejectWithdrawal);
router.get("/:id/verify", requireAuth, requireAdmin, verifyCashout);

export default router;
