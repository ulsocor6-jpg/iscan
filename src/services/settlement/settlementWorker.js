import ledgerService from "../ledgerService.js";
import walletService from "../walletService.js";
import transactionService from "../transactionService.js";

export default async function settlementWorker(job) {

  console.log(
    "[SETTLEMENT WORKER RECEIVED]",
    JSON.stringify(job)
  );

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

    console.log(
      "[SETTLEMENT COMPLETED]",
      txId
    );

    return { success: true };

  } catch (err) {

    console.error(
      "[SETTLEMENT ERROR]",
      err
    );

    await transactionService.update(txId, {
      status: "FAILED",
      failureReason: err.message,
    });

    throw err;
  }
}
