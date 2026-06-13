import MayaProvider from "../../integrations/paymentProviders/mayaProvider.js";
import Transaction from "../../models/transactionModel.js";
import { writeEntry } from "../ledgerWriter.js";

export async function processSettlement(job) {
  const { txId, amount, account, referenceId, fee, net } = job;

  // STEP 1: load transaction
  const tx = await Transaction.findById(txId);
  if (!tx) throw new Error("Transaction not found");

  // STEP 2: call provider
  const result = await MayaProvider.sendMoney({
    amount: net,
    account,
    referenceId
  });

  if (!result.success) {
    throw new Error("Provider failed");
  }

  // STEP 3: finalize ledger (ONLY HERE after success)
  await writeEntry({
    userId: tx.senderId,
    referenceId,
    type: "cashout_debit",
    debit: amount,
    credit: 0,
    counterparty: account
  });

  await writeEntry({
    userId: "MAYA_SETTLEMENT",
    referenceId,
    type: "settlement_credit",
    credit: net,
    counterparty: account
  });

  await writeEntry({
    userId: "ISCAN_REVENUE",
    referenceId,
    type: "fee",
    credit: fee,
    counterparty: account
  });

  // STEP 4: update transaction
  tx.status = "settled";
  tx.settlementRef = result.referenceId;
  await tx.save();

  return result;
}
