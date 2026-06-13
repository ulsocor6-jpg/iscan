import Ledger from "../models/ledgerModel.js";

export async function writeEntry({
  userId,
  referenceId,
  type,
  debit = 0,
  credit = 0,
  currency = "PHP",
  counterparty = null,
  metadata = {}
}) {

  return Ledger.create({
    userId,
    referenceId,
    transactionType: type,
    debit,
    credit,
    currency,
    counterpartyAddress: counterparty,
    status: "completed",
    metadata
  });

}
