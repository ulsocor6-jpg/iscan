import express from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  getWalletSummary,
  getWalletMe,
  getBalance,
  getWallets,
  linkWallet,
  unlinkWallet,
  linkFiatAccount,
  createWallet
} from "../controllers/walletController.js";

const router = express.Router();

router.get("/summary",  requireAuth, getWalletSummary);  // full snapshot
router.get("/balance",  requireAuth, getBalance);         // balance + totals
router.get("/me",       requireAuth, getWalletMe);        // iscanAddress + balance
router.get("/list",     requireAuth, getWallets);         // crypto wallets + iscanAddress
router.post("/link",    requireAuth, linkWallet);         // link crypto wallet
router.post("/unlink",  requireAuth, unlinkWallet);       // unlink crypto wallet
router.post("/linked",  requireAuth, linkFiatAccount);    // link gcash/maya/bank
router.post("/create",  requireAuth, createWallet);       // admin use
router.get("/status",   (req, res) => res.json({ success: true }));

export default router;
