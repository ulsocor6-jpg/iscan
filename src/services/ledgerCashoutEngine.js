import Ledger from "../models/ledgerModel.js";
import Transaction from "../models/transactionModel.js";
import MayaProvider from "../integrations/mayaProvider.js";
import crypto from "crypto";
import { getLedgerBalance } from "./ledgerBalanceService.js";

const FEE_RATE = 0.015;

const ISCAN_REVENUE = "ISCAN_REVENUE";
const MAYA_SETTLEMENT = "MAYA_SETTLEMENT";

export async function ledgerCashout({
  userId,
  amount,
  account
}) {

  if (amount <= 0) {
    throw new Error("Invalid amount");
  }

  // STEP 1: CHECK LEDGER BALANCE
  const balance = await getLedgerBalance(userId);

  if (balance < amount) {
    throw new Error("Insufficient balance");
  }

  const fee = amount * FEE_RATE;
  const netAmount = amount - fee;

  const referenceId = "CSH-" + crypto.randomBytes(6).toString("hex");

  // STEP 2: CREATE TRANSACTION (PENDING)
  const tx = await Transaction.create({
    senderId: userId,
    receiverId: null,
    amount,
    currency: "PHP",
    fee,
    type: "cashout",
    status: "processing",
    ledgerGroupId: "LEDGER_MAIN",
    settlementMethod: "maya",
    referenceId
  });

  try {

    // STEP 3: MAYA SETTLEMENT
    const result = await MayaProvider.sendMoney({
      amount: netAmount,
      account,
      referenceId
    });

    if (!result.success) {
      throw new Error("Maya payout failed");
    }

    // STEP 4: DOUBLE ENTRY LEDGER WRITE

    // (A) USER DEBIT
    await Ledger.create({
      userId,
      referenceId,
      transactionType: "cashout",
      debit: amount,
      credit: 0,
      currency: "PHP",
      counterpartyAddress: account,
      status: "completed",
      metadata: { fee, netAmount }
    });

    // (B) MAYA SETTLEMENT CREDIT
    await Ledger.create({
      userId: MAYA_SETTLEMENT,
      referenceId,
      transactionType: "cashout_settlement",
      debit: 0,
      credit: netAmount,
      currency: "PHP",
      counterpartyAddress: account,
      status: "completed"
    });

    // (C) ISCAN REVENUE (FEE)
    await Ledger.create({
      userId: ISCAN_REVENUE,
      referenceId,
      transactionType: "fee",
      debit: 0,
      credit: fee,
      currency: "PHP",
      counterpartyAddress: account,
      status: "completed"
    });

    // STEP 5: FINALIZE TRANSACTION
    tx.status = "settled";
    tx.settlementRef = result.referenceId;
    tx.metadata = {
      fee,
      netAmount,
      provider: "maya"
    };

    await tx.save();

    return {
      success: true,
      referenceId,
      fee,
      netAmount,
      status: "settled"
    };

  } catch (err) {

    tx.status = "failed";
    tx.metadata = {
      error: err.message
    };

    await tx.save();
    throw err;
  }
}
