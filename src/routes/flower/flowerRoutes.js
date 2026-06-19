import express from "express";
import { requireAuth as authGuard } from "../../middleware/authMiddleware.js";
import { quoteFlowerUsdtSwap, executeFlowerUsdtSwap } from "../../controllers/flower/flowerUsdtController.js";
import {
  getFlowerWallet,
  createOrder,
  getOrderStatus,
  manualConfirm
} from "../../controllers/flower/flowerController.js";

const router = express.Router();

router.get("/wallet", authGuard, getFlowerWallet);
router.post("/create", authGuard, createOrder);
router.get("/status/:orderId", authGuard, getOrderStatus);
router.post("/confirm", authGuard, manualConfirm);
router.get("/usdt/quote", authGuard, quoteFlowerUsdtSwap);
router.post("/usdt/swap", authGuard, executeFlowerUsdtSwap);

export default router;
