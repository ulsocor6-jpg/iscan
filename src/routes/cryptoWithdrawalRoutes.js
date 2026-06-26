import express from "express";
import { createCryptoWithdrawal, getCryptoWithdrawals } from "../controllers/cryptoWithdrawalController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/request", requireAuth, createCryptoWithdrawal);
router.get("/history", requireAuth, getCryptoWithdrawals);

export default router;
