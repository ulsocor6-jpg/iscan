import crypto from 'crypto';
import Wallet from '../models/walletModel.js';

export const transfer = async (req, res) => {
  try {
    const {
      fromWalletId,
      toWalletId,
      amount,
      referenceId,
      asset = 'USDT'
    } = req.body;

    // ==============================
    // 1. VALIDATION
    // ==============================
    if (!fromWalletId || !toWalletId) {
      return res.status(400).json({
        success: false,
        message: "Wallet IDs are required"
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    if (fromWalletId === toWalletId) {
      return res.status(400).json({
        success: false,
        message: "Cannot transfer to same wallet"
      });
    }

    const txRef = referenceId || crypto.randomUUID();

    // ==============================
    // 2. LOAD WALLETS
    // ==============================
    const fromWallet = await Wallet.findById(fromWalletId);
    const toWallet = await Wallet.findById(toWalletId);

    if (!fromWallet || !toWallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    // ==============================
    // 3. INIT BALANCES IF NULL
    // ==============================
    if (!fromWallet.balances) fromWallet.balances = new Map();
    if (!toWallet.balances) toWallet.balances = new Map();

    const senderBalance = fromWallet.balances.get(asset) || 0;

    // ==============================
    // 4. CHECK FUNDS
    // ==============================
    if (senderBalance < amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${asset} balance`
      });
    }

    // ==============================
    // 5. UPDATE BALANCES (ATOMIC LOGIC)
    // ==============================
    const receiverBalance = toWallet.balances.get(asset) || 0;

    fromWallet.balances.set(asset, senderBalance - amount);
    toWallet.balances.set(asset, receiverBalance + amount);

    // mark modified for Mongo Map field
    fromWallet.markModified('balances');
    toWallet.markModified('balances');

    await fromWallet.save();
    await toWallet.save();

    // ==============================
    // 6. RESPONSE
    // ==============================
    return res.status(200).json({
      success: true,
      message: "Transfer completed successfully",
      referenceId: txRef,
      data: {
        asset,
        amount,
        from: fromWalletId,
        to: toWalletId,
        fromBalance: fromWallet.balances.get(asset),
        toBalance: toWallet.balances.get(asset)
      }
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Transfer failed",
      error: err.message
    });
  }
};
