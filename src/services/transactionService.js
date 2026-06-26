import Ledger from '../models/ledgerModel.js';
import Transaction from '../models/transactionModel.js';
import Wallet from '../models/walletModel.js';
import WalletService from './walletService.js';
import crypto from 'crypto';

class TransactionService {

  async transfer({
    senderId,
    receiverId,
    amount,
    asset = 'USDT',
    referenceId
  }) {

    const txRef = referenceId || crypto.randomUUID();

    const senderWallet = await Wallet.findOne({ userId: senderId });

    const receiverWallet = await Wallet.findOne({ userId: receiverId });

    if (!senderWallet)
      throw new Error("Sender wallet not found");

    if (!receiverWallet)
      throw new Error("Receiver wallet not found");

    const senderBalance = await WalletService.getBalance(senderId, asset);

    if (senderBalance < amount) {
      throw new Error('Insufficient balance');
    }

    // =========================
    // 1. WRITE LEDGER (SOURCE OF TRUTH)
    // =========================
    console.log("[TRANSFER] Starting ledger write");
    console.log("[TRANSFER] Reference:", txRef);

    try {

      const ledgerRows = [
        {
          referenceId: txRef,
          userId: senderId,
          transactionType: 'transfer',
          debit: amount,
          credit: 0,
          currency: asset,
          status: 'completed',
          description: `Sent ${amount} ${asset}`
        },
        {
          referenceId: txRef,
          userId: receiverId,
          transactionType: 'transfer',
          debit: 0,
          credit: amount,
          currency: asset,
          status: 'completed',
          description: `Received ${amount} ${asset}`
        }
      ];

      console.log("[TRANSFER] Ledger payload:");
      console.dir(ledgerRows, { depth: null });

      const result = await Ledger.create(ledgerRows);

      console.log("[TRANSFER] Ledger create OK");
      console.dir(result, { depth: 2 });

    } catch (err) {

      console.error("==================================");
      console.error("[TRANSFER] LEDGER CREATE FAILED");
      console.error("Name:", err.name);
      console.error("Code:", err.code);
      console.error("Message:", err.message);

      if (err.writeErrors)
        console.dir(err.writeErrors, { depth: null });

      if (err.errors)
        console.dir(err.errors, { depth: null });

      console.error(err);

      throw err;
    }

    console.log("[TRANSFER] Ledger write finished successfully");

    // =========================
    // 2. TRANSACTION RECORD
    // =========================

    console.log("[TRANSFER] Creating Transaction document...");

    console.log({
      senderId,
      receiverId,
      senderAddress: senderWallet.iscanAddress,
      receiverAddress: receiverWallet.iscanAddress,
      amount,
      asset,
      referenceId: txRef
    });

    const tx = await Transaction.create({
      referenceId: txRef,
      ledgerGroupId: txRef,

      senderId,
      receiverId,

      senderAddress: senderWallet.iscanAddress,
      receiverAddress: receiverWallet.iscanAddress,

      amount,
      currency: asset,

      type: 'transfer',
      status: 'settled',

      completedAt: new Date()
    });

    console.log("[TRANSFER] Transaction created successfully");

    return {
      success: true,
      referenceId: txRef,
      transaction: tx
    };
  }

  // ── STUBS (added by fix_webhook_and_stubs.sh) ────────────────────────────
  // TODO: implement real lookups/state transitions against Transaction model.

  async findByReference(referenceId) {
    console.warn(
      `[TransactionService.findByReference] STUB CALLED - not implemented. referenceId=${referenceId}`
    );
    return null;
  }

  async transitionTo(txId, newStatus, meta = {}) {
    console.warn(
      `[TransactionService.transitionTo] STUB CALLED - not implemented. txId=${txId} newStatus=${newStatus} meta=${JSON.stringify(meta)}`
    );
    return null;
  }

  async markSettled(txId) {
    console.warn(
      `[TransactionService.markSettled] STUB CALLED - not implemented. txId=${txId}`
    );
    return null;
  }

  async markFailed(txId) {
    console.warn(
      `[TransactionService.markFailed] STUB CALLED - not implemented. txId=${txId}`
    );
    return null;
  }
}
export default new TransactionService();
