import CryptoDeposit from "../models/cryptoDepositModel.js";
import { creditUser } from "../services/ledger/creditService.js";

export async function listPending(req, res) {
  try {
    const deposits = await CryptoDeposit.find({
      status: "deposit_detected"
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: deposits.length,
      deposits
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function approveDeposit(req, res) {
  try {
    const dep = await CryptoDeposit.findById(req.params.id);

    if (!dep) {
      return res.status(404).json({
        error: "Deposit not found"
      });
    }

    await creditUser({
      userId: dep.userId,
      amount: dep.usdAmount,
      asset: dep.token,
      txHash: dep.detectedTxHash,
      chain: dep.chainId
    });

    dep.status = "completed";
    await dep.save();

    res.json({
      success: true,
      depositId: dep._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
