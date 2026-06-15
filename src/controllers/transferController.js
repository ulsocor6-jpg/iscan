import crypto from "crypto";
import transferOrchestrator from "../services/transferOrchestrator.js";

export const transfer = async (req, res) => {
  try {
    const {
      fromWalletId,
      toWalletId,
      amount,
      referenceId,
      asset = "USDT",
    } = req.body;

    // ==============================
    // 1. BASIC VALIDATION (keep thin)
    // ==============================
    if (!fromWalletId || !toWalletId) {
      return res.status(400).json({
        success: false,
        message: "Wallet IDs are required",
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    if (fromWalletId === toWalletId) {
      return res.status(400).json({
        success: false,
        message: "Cannot transfer to same wallet",
      });
    }

    const txRef = referenceId || crypto.randomUUID();

    // ==============================
    // 2. DELEGATE TO ORCHESTRATOR
    // ==============================
    const result = await transferOrchestrator.executeTransfer({
      senderWalletId: fromWalletId,
      receiverWalletId: toWalletId,
      amount,
      currency: asset,
      referenceId: txRef,
    });

    // ==============================
    // 3. RESPONSE
    // ==============================
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json({
      success: true,
      message: "Transfer processed successfully",
      referenceId: txRef,
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Transfer failed",
      error: err.message,
    });
  }
};
