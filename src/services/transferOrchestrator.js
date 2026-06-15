const fxService = require("./fx/fxService");
const fraudBlockingService = require("./fraudBlockingService");
const fraudService = require("./fraudService");
const ledgerService = require("./ledgerService");
const walletService = require("./walletService");
const settlementQueue = require("./settlement/settlementQueue");
const transactionService = require("./transactionService");
const lockService = require("./lockService");
const feeCalculator = require("./feeCalculator");
const Wallet = require("../models/walletModel");
const idempotencyService = require("./idempotencyService");

class TransferOrchestrator {
  async executeTransfer({
    senderWalletId,
    receiverWalletId,
    amount,
    currency = "PHP",
    targetCurrency = "PHP",
    referenceId,
  }) {
    const lockKey = `transfer:${senderWalletId}:${receiverWalletId}`;

    const idemKey =
      referenceId || `${senderWalletId}:${receiverWalletId}:${amount}`;

    if (idempotencyService.isProcessed(idemKey)) {
      return idempotencyService.get(idemKey).value;
    }

    try {
      await lockService.acquire(lockKey);

      const senderWallet = await Wallet.findById(senderWalletId);
      const receiverWallet = await Wallet.findById(receiverWalletId);

      if (!senderWallet || !receiverWallet) {
        return { success: false, reason: "WALLET_NOT_FOUND" };
      }

      const senderBalance = senderWallet.balances?.get(currency) || 0;

      if (senderBalance < amount) {
        return { success: false, reason: "INSUFFICIENT_FUNDS" };
      }

      const tx = await transactionService.create({
        senderId: senderWallet.userId,
        receiverId: receiverWallet.userId,
        amount,
        currency,
        status: "PENDING",
        referenceId,
      });

      // Layer 1: 1h velocity + basic rules
      const layer1 = await fraudService.evaluateTransaction({
        senderId: senderWallet.userId,
        receiverId: receiverWallet.userId,
        amount,
      });

      if (layer1.block) {
        await this.fail(tx.id, 'FRAUD_BLOCK');
        return { success: false, reason: 'FRAUD_BLOCK', layer: 1 };
      }

      // Layer 2 + 3: 24h AI scoring + all-time behavioral
      const deepRisk = await fraudBlockingService.evaluate({
        userId: senderWallet.userId,
        amount,
      });

      if (!deepRisk.allowed) {
        await this.fail(tx.id, deepRisk.reason);
        return { success: false, reason: deepRisk.reason };
      }

      let converted = amount;
      let fxRate = 1;

      if (currency !== targetCurrency) {
        const fx = await fxService.getRate(currency, targetCurrency);
        fxRate = fx.rate;
        converted = amount * fxRate;
      }

      const fee = feeCalculator.calculate({
        amount: converted,
        type: "TRANSFER",
      });

      const finalAmount = converted - fee;

      await ledgerService.reserve({
        userId: senderWallet.userId,
        amount: converted,
        currency,
        reference: tx.id,
      });

      await ledgerService.credit({
        userId: receiverWallet.userId,
        amount: finalAmount,
        currency: targetCurrency,
        reference: tx.id,
      });

      await walletService.syncFromLedger(senderWallet.userId);
      await walletService.syncFromLedger(receiverWallet.userId);

      await settlementQueue.add("finalize-transfer", {
        txId: tx.id,
        senderId: senderWallet.userId,
        receiverId: receiverWallet.userId,
        fxRate,
        finalCreditAmount: finalAmount,
      });

      const result = {
        success: true,
        txId: tx.id,
        fxRate,
        credited: finalAmount,
      };

      idempotencyService.markProcessed(idemKey, result);

      return result;
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      await lockService.release(lockKey);
    }
  }

  async fail(txId, reason) {
    await transactionService.update(txId, {
      status: "FAILED",
      failureReason: reason,
    });
  }
}

module.exports = new TransferOrchestrator();
