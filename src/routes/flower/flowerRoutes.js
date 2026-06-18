import express from "express";
import authGuard from "../../middleware/authMiddleware.js";

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

export default router;
