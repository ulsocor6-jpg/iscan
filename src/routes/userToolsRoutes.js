import express from "express";
import { requireAuth } from "../auth/middleware/authMiddleware.js";
import {
    getUserDashboard,
    getFlowDetail,
    retryUserFlow,
    cancelUserFlow,
} from "../controllers/userToolsController.js";

const router = express.Router();

router.get("/dashboard", requireAuth, getUserDashboard);
router.get("/flow/:flowId", requireAuth, getFlowDetail);
router.post("/retry", requireAuth, retryUserFlow);
router.post("/cancel", requireAuth, cancelUserFlow);

router.get("/balance", requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const Wallet = (await import("../models/walletModel.js")).default;
        const { getLiveBalancesForWallet } = await import("../services/onchainBalanceService.js");
        const { getPendingSweepTotalsByChain } = await import("../services/flower/flowerPendingSweepService.js");
        const wallet = await Wallet.findOne({ userId });
        if (!wallet) return res.json({ success: true, data: { USDC: 0, USDT: 0, FLOWER: 0 } });
        const onchain = await getLiveBalancesForWallet(wallet).catch(() => ({}));
        const pendingSweep = await getPendingSweepTotalsByChain(userId);
        const balances = { USDC: 0, USDT: 0, FLOWER: 0 };
        for (const token of ["USDC", "USDT", "FLOWER"]) for (const data of Object.values(onchain)) if (data[token]) balances[token] += data[token];
        for (const amt of Object.values(pendingSweep)) balances.FLOWER = Math.max(0, balances.FLOWER - amt);
        res.json({ success: true, data: { balances, onchain, pendingSweep } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
