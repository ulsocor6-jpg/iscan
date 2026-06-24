import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import walletService from "../services/walletService.js";
import crypto from "crypto";

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
