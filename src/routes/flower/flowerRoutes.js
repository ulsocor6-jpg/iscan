import express from "express";
import { requireAuth as authGuard } from "../../middleware/authMiddleware.js";
import { quoteFlowerUsdtSwap, executeFlowerUsdtSwap } from "../../controllers/flower/flowerUsdtController.js";
import {
  getFlowerWallet,
  createOrder,
  getOrderStatus,
  manualConfirm
} from "../../controllers/flower/flowerController.js";
import { retryOrder } from "../../services/flower/flowerOrderRecovery.js";
import FlowerOrder from "../../models/flower/flowerOrderModel.js";

const router = express.Router();

router.get("/wallet", authGuard, getFlowerWallet);
router.post("/create", authGuard, createOrder);
router.get("/status/:orderId", authGuard, getOrderStatus);
router.post("/confirm", authGuard, manualConfirm);
router.get("/usdt/quote", authGuard, quoteFlowerUsdtSwap);
router.post("/usdt/swap", authGuard, executeFlowerUsdtSwap);

router.get("/mine/active", authGuard, async (req, res) => {
  const order = await FlowerOrder.findOne({
    userId: req.user.id,
    status: { $nin: ["COMPLETED"] }
  }).sort({ createdAt: -1 });
  res.json({ success: true, order });
});

router.post("/:orderId/retry", authGuard, async (req, res) => {
  try {
    const order = await retryOrder(req.params.orderId, { requesterId: req.user.id });
    res.json({ success: true, order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
