import express from "express";
import { requireAuth } from "../auth/middleware/authMiddleware.js";
import {
  lookupWithdrawal,
  retryWithdrawal,
  cancelWithdrawal,
  chatSupport,
} from "../controllers/supportController.js";

const router = express.Router();

// No requireAdmin here on purpose — this is the client-facing "User
// Tools" surface. Ownership scoping happens inside the controller via
// req.user.id, not via role.
router.post("/withdrawals/lookup", requireAuth, lookupWithdrawal);
router.post("/withdrawals/retry", requireAuth, retryWithdrawal);
router.post("/withdrawals/cancel", requireAuth, cancelWithdrawal);
router.post("/chat", requireAuth, chatSupport);

export default router;
