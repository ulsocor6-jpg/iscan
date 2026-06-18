// src/controllers/flowerController.js

import crypto                              from "crypto";
import FlowerOrder                         from "../../models/flower/flowerOrderModel.js";
import { confirmByTxHash }                 from "../../services/flower/flowerWatcherService.js";
import { getOrCreateRoninDepositAddress }  from "../../services/flower/flowerWalletService.js";

// GET /api/flower/wallet
// Returns the user's Ronin deposit address for FLOWER (creates it if needed)
export const getFlowerWallet = async (req, res) => {
  try {
    const result = await getOrCreateRoninDepositAddress(req.user.id);

    res.json({
      success: true,
      wallet: {
        address: result.address,
        chain:   "RONIN",
        chainId: "0x7e4",
        token:   "FLOWER",
        network: "Ronin Mainnet",
        note:    "Send FLOWER tokens to this address to initiate a swap"
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/flower/create
// Body: { expectedAmount: Number }
export const createOrder = async (req, res) => {
  try {
    const { expectedAmount } = req.body;

    if (!expectedAmount || expectedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "expectedAmount must be a positive number"
      });
    }

    const { address: depositAddress } =
      await getOrCreateRoninDepositAddress(req.user.id);

    const orderId = "FLW-" + crypto.randomBytes(6).toString("hex");

    const order = await FlowerOrder.create({
      orderId,
      userId:         req.user.id,
      expectedAmount,
      depositAddress,
      status:         "WAITING_DEPOSIT"
    });

    res.json({
      success: true,
      order: {
        orderId:        order.orderId,
        depositAddress: order.depositAddress,
        expectedAmount: order.expectedAmount,
        status:         order.status,
        chain:          "RONIN",
        token:          "FLOWER",
        note:           `Send exactly ${expectedAmount} FLOWER to this address`,
        createdAt:      order.createdAt
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/flower/status/:orderId
export const getOrderStatus = async (req, res) => {
  try {
    const order = await FlowerOrder.findOne({
      orderId: req.params.orderId,
      userId:  req.user.id
    });

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.json({
      success: true,
      order: {
        orderId:        order.orderId,
        status:         order.status,
        depositAddress: order.depositAddress,
        expectedAmount: order.expectedAmount,
        receivedAmount: order.receivedAmount,
        usdcReceived:   order.usdcReceived,
        phpAmount:      order.phpAmount,
        feeAmount:      order.feeAmount,
        txHash:         order.txHash,
        swapTxHash:     order.swapTxHash,
        createdAt:      order.createdAt,
        updatedAt:      order.updatedAt
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/flower/confirm
// Manual trigger: { orderId, txHash }
export const manualConfirm = async (req, res) => {
  try {
    const { orderId, txHash } = req.body;

    if (!orderId || !txHash) {
      return res.status(400).json({
        success: false,
        message: "orderId and txHash are required"
      });
    }

    const order = await FlowerOrder.findOne({ orderId, userId: req.user.id });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    await confirmByTxHash(orderId, txHash);

    res.json({
      success: true,
      message: "Confirmation triggered — pipeline is processing"
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
