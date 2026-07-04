import express from "express";
import {
  listPendingWithdrawals,
  approveWithdrawal,
  verifyCashout
} from "../controllers/adminWithdrawalController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/pending", requireAuth, requireAdmin, listPendingWithdrawals);
router.post("/:id/approve", requireAuth, requireAdmin, approveWithdrawal);
router.get("/:id/verify", requireAuth, requireAdmin, verifyCashout);

export default router;
