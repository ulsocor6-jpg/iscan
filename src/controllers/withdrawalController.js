import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import walletService from "../services/walletService.js";
import crypto from "crypto";
import eventStreamService from "../services/eventStreamService.js";

export async function createWithdrawal(req, res) {
  try {
    const {
      asset,
      amount,
      destinationAddress
    } = req.body;

    const balance =
      await walletService.getBalance(
        req.user.id,
        asset
      );

    if (balance < amount) {
      return res.status(400).json({
        error: `Insufficient ${asset}`
      });
    }

    const withdrawal =
      await WithdrawalRequest.create({
        userId: req.user.id,
        asset,
        amount,
        destinationAddress
      });

    await eventStreamService.emit("withdrawal.created", {
  entityId: withdrawal._id.toString(),
        userId: req.user.id,
        asset,
        amount,
        destinationAddress,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt
      ,
  userEmail: req.user.email || "unknown",
  userName: req.user.firstName ? (req.user.firstName + " " + (req.user.lastName || "")) : "unknown"
});

    res.json({
      success: true,
      withdrawal
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
}
