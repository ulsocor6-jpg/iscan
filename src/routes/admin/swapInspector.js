import express from "express";
import FlowerOrder from "../../models/flower/flowerOrderModel.js";
import { retryOrder } from "../../services/flower/flowerOrderRecovery.js";
import requireAuth, { requireAdmin } from "../../auth/middleware/authMiddleware.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

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

// ── Full order intelligence: swap + user balance + affordability ────────
router.get("/flower-orders/:orderId/intelligence", async (req, res) => {
  try {
    const order = await FlowerOrder.findOne({ orderId: req.params.orderId }).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });

    // Get user's wallet with chain addresses
    const Wallet = (await import("../../models/walletModel.js")).default;
    const wallet = await Wallet.findOne({ userId: order.userId }).lean();

    // Get live on-chain balances
    const { getLiveBalancesForWallet } = await import("../../services/onchainBalanceService.js");
    const onchainBalances = wallet ? await getLiveBalancesForWallet(wallet).catch(() => ({})) : {};

    // Get ledger balance
    const Ledger = (await import("../../models/ledgerModel.js")).default;
    const mongoose = (await import("mongoose")).default;
    const ledgerResult = await Ledger.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(order.userId) } },
      { $group: { _id: "$currency", balance: { $sum: { $subtract: [{ $ifNull: ["$credit", 0] }, { $ifNull: ["$debit", 0] }] } } } }
    ]);
    const ledgerBalances = {};
    ledgerResult.forEach(r => { ledgerBalances[r._id] = Math.max(0, r.balance); });

    // Find the specific chain address used for this order
    const chainAddress = wallet?.chainAddresses?.find(
      a => a.address?.toLowerCase() === order.depositAddress?.toLowerCase()
    );

    // Check affordability
    const requiredToken = order.direction === "USDC_TO_FLOWER" ? "USDC" : "FLOWER";
    const requiredAmount = order.direction === "USDC_TO_FLOWER" ? (order.usdcAmountIn || 0) : (order.expectedAmount || 0);
    const onchainTotal = Object.values(onchainBalances).reduce((sum, chain) => sum + (chain[requiredToken] || 0), 0);
    const ledgerAmount = ledgerBalances[requiredToken] || 0;
    const canAfford = onchainTotal >= requiredAmount || ledgerAmount >= requiredAmount;

    // Build the diagnosis
    let diagnosis = "";
    if (order.status === "WAITING_DEPOSIT") {
      if (!canAfford) {
        diagnosis = `❌ Insufficient ${requiredToken}. Has ${onchainTotal.toFixed(6)} on-chain + ${ledgerAmount.toFixed(6)} in ledger. Needs ${requiredAmount}.`;
      } else {
        diagnosis = `✅ Sufficient ${requiredToken} (${onchainTotal.toFixed(6)} on-chain). Waiting for deposit to ${order.depositAddress?.slice(0, 10)}...`;
      }
    } else if (order.status === "COMPLETED") {
      diagnosis = `✅ Swap completed successfully.`;
    } else if (order.status?.startsWith("FAILED")) {
      diagnosis = `❌ Failed: ${order.failureReason || order.status}. Retry available.`;
    } else {
      diagnosis = `Status: ${order.status}. Stage: ${order.currentStage || 'unknown'}.`;
    }

    res.json({
      success: true,
      data: {
        order: {
          orderId: order.orderId,
          direction: order.direction,
          status: order.status,
          currentStage: order.currentStage,
          expectedAmount: order.expectedAmount,
          usdcAmountIn: order.usdcAmountIn,
          depositAddress: order.depositAddress,
          chain: order.chain,
          failureReason: order.failureReason,
          sweepAttempts: order.sweepAttempts,
          swapAttempts: order.swapAttempts,
          createdAt: order.createdAt,
        },
        user: {
          userId: order.userId,
          onchainBalances,
          ledgerBalances,
          chainAddress: chainAddress ? {
            chain: chainAddress.chain,
            address: chainAddress.address,
            native: chainAddress.nativeBalance,
            USDC: chainAddress.usdcBalance,
            USDT: chainAddress.usdtBalance,
            FLOWER: chainAddress.flowerBalance,
            lastSynced: chainAddress.lastSynced,
          } : null,
        },
        affordability: {
          requiredToken,
          requiredAmount,
          onchainBalance: onchainTotal,
          ledgerBalance: ledgerAmount,
          canAfford,
        },
        diagnosis,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
