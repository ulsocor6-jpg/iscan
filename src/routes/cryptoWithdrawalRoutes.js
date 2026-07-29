import express from "express";
import { createCryptoWithdrawal, getCryptoWithdrawals } from "../controllers/cryptoWithdrawalController.js";
import { requireAuth } from "../auth/middleware/authMiddleware.js";
import { requireOtpIfNeeded } from "../middleware/requireOtp.js";

const router = express.Router();

router.post("/request", requireAuth, requireOtpIfNeeded, createCryptoWithdrawal);
router.get("/history", requireAuth, getCryptoWithdrawals);

export default router;
