import express from "express";
import { createWithdrawal } from "../controllers/withdrawalController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/request",
  requireAuth,
  createWithdrawal
);

export default router;
