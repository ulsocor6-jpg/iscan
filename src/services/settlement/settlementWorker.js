import ledgerService from "../ledgerService.js";
import walletService from "../walletService.js";
import transactionService from "../transactionService.js";

export default async function settlementWorker(job) {
  const {
    txId,
    senderId,
    receiverId,
    fxRate,
    finalCreditAmount,
  } = job.data;

  try {
    await ledgerService.commit({ reference: txId });

    await walletService.syncFromLedger(senderId);
    await walletService.syncFromLedger(receiverId);

    await transactionService.update(txId, {
      status: "COMPLETED",
      fxRate,
      finalCreditAmount,
    });

    return { success: true };
  } catch (err) {
    console.error("SETTLEMENT ERROR", err);

    await transactionService.update(txId, {
      status: "FAILED",
      failureReason: err.message,
    });

    throw err;
  }
}
