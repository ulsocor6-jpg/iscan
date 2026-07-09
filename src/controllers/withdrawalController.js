import WithdrawalRequest from "../models/withdrawalRequestModel.js";
import walletService from "../services/walletService.js";
import crypto from "crypto";
import eventStreamService from "../services/eventStreamService.js";
import { settleCryptoWithdrawal, exceedsAutoApproveLimit } from "../services/withdrawalProcessor.js";

export async function createWithdrawal(req, res) {
  try {
    const {
      asset,
      amount,
      destinationAddress,
      type = "crypto",
      network
    } = req.body;

    // Crypto withdrawals need a chain to send on — catch this at request
    // time rather than letting it reach approval with nowhere to route.
    if (type === "crypto" && !network) {
      return res.status(400).json({
        error: "network (BASE or RONIN) is required for crypto withdrawals"
      });
    }

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
        destinationAddress,
        type,
        network
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

    // Balance is already confirmed sufficient above — crypto withdrawals
    // settle immediately with no manual admin step, unless an optional
    // per-asset cap (AUTO_WITHDRAW_LIMIT_<ASSET> env var) says otherwise,
    // in which case it's left as "pending_review" for manual approval.
    if (type === "crypto" && !exceedsAutoApproveLimit(withdrawal)) {
      const result = await settleCryptoWithdrawal(withdrawal);
      if (!result.success) {
        return res.status(502).json({
          success: false,
          error: `Withdrawal request created, but the on-chain send failed and was reversed: ${result.error}`,
          withdrawal: result.withdrawal
        });
      }
    }

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
