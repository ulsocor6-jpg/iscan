import express from "express";
import {
  listPendingWithdrawals,
  approveWithdrawal,
  verifyCashout
} from "../controllers/adminWithdrawalController.js";

const router = express.Router();

router.get("/pending", listPendingWithdrawals);
router.post("/:id/approve", approveWithdrawal);
router.get("/:id/verify", verifyCashout);

export default router;
