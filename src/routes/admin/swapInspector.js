import express from "express";
import FlowerOrder from "../../models/flower/flowerOrderModel.js";
import { retryOrder } from "../../services/flower/flowerOrderRecovery.js";

const router = express.Router();

router.get("/flower-orders", async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const orders = await FlowerOrder.find(filter).sort({ updatedAt: -1 }).limit(200);
  res.json({ success: true, orders });
});

router.post("/flower-orders/:orderId/retry", async (req, res) => {
  try {
    const order = await retryOrder(req.params.orderId, { isAdmin: true });
    res.json({ success: true, order });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
