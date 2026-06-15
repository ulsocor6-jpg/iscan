import Ledger from '../models/ledgerModel.js';
import Transaction from '../models/transactionModel.js';
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

    const senderBalance = await WalletService.getBalance(senderId, asset);

    if (senderBalance < amount) {
      throw new Error('Insufficient balance');
    }

    // =========================
    // 1. WRITE LEDGER (SOURCE OF TRUTH)
    // =========================
    await Ledger.create([
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
    ]);

    // =========================
    // 2. SYNC CACHE WALLET
    // =========================
    await WalletService.debit(senderId, asset, amount);
    await WalletService.credit(receiverId, asset, amount);

    // =========================
    // 3. TRANSACTION RECORD
    // =========================
    const tx = await Transaction.create({
      referenceId: txRef,
      senderId,
      receiverId,
      amount,
      currency: asset,
      type: 'transfer',
      status: 'settled'
    });

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
