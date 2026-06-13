import crypto from "crypto";

import Transaction from "../models/transactionModel.js";
import MayaProvider from "../integrations/mayaProvider.js";

import { getLedgerBalance } from "./ledgerBalanceService.js";
import { writeEntry } from "./ledgerWriter.js";
import { lockFxRate } from "./fx/lockedFxEngine.js";

const FEE_RATE = 0.015;

// system ledger accounts (must exist in ledger system)
const SYSTEM_ACCOUNTS = {
  REVENUE: "ISCAN_REVENUE",
  SETTLEMENT: "MAYA_SETTLEMENT"
};

/**
 * FINTECH CASHOUT ENGINE (PRODUCTION SAFE)
 */
export async function fintechCashout({
  userId,
  amount,
  account,
  currency = "PHP",
  idempotencyKey
}) {
  if (!userId || !amount || !account) {
    throw new Error("Missing required parameters");
  }

  // -------------------------------
  // STEP 1: IDEMPOTENCY CHECK
  // -------------------------------
  if (idempotencyKey) {
    const existingTx = await Transaction.findOne({ idempotencyKey });

    if (existingTx) {
      return {
        success: true,
        cached: true,
        referenceId: existingTx.referenceId,
        status: existingTx.status
      };
    }
  }

  // -------------------------------
  // STEP 2: BALANCE CHECK (LEDGER)
  // -------------------------------
  const balance = await getLedgerBalance(userId);

  if (balance < amount) {
    throw new Error("Insufficient balance");
  }

  // -------------------------------
  // STEP 3: LOCK FX RATE
  // -------------------------------
  const fx = await lockFxRate({
    amount,
    currency,
    transactionId: crypto.randomUUID()
  });

  // -------------------------------
  // STEP 4: CALCULATE FEES
  // -------------------------------
  const fee = amount * FEE_RATE;
  const net = amount - fee;

  // -------------------------------
  // STEP 5: CREATE TRANSACTION (INIT)
  // -------------------------------
  const referenceId = "CSH-" + crypto.randomBytes(6).toString("hex");

  const tx = await Transaction.create({
    senderId: userId,
    receiverId: null,
    amount,
    fee,
    currency,
    type: "cashout",
    status: "created",
    ledgerGroupId: "LEDGER_MAIN",
    referenceId,
    idempotencyKey: idempotencyKey || null,
    metadata: {
      fxRate: fx.rate,
      phpAmount: fx.phpAmount,
      lockedAt: fx.createdAt
    }
  });

  try {
    // -------------------------------
    // STEP 6: RESERVE FUNDS (LEDGER HOLD)
    // -------------------------------
    await writeEntry({
      userId,
      referenceId,
      type: "cashout_reservation",
      debit: amount,
      credit: 0,
      currency: "PHP",
      status: "reserved",
      counterparty: account,
      metadata: { fx }
    });

    // -------------------------------
    // STEP 7: PROVIDER CALL (MAYA)
    // -------------------------------
    const result = await MayaProvider.sendMoney({
      amount: net,
      account,
      referenceId
    });

    if (!result.success) {
      throw new Error("Provider failed");
    }

    // -------------------------------
    // STEP 8: LEDGER POSTING
    // -------------------------------

    // user debit
    await writeEntry({
      userId,
      referenceId,
      type: "cashout_debit",
      debit: amount,
      credit: 0,
      currency: "PHP",
      counterparty: account,
      metadata: { fee, net }
    });

    // settlement credit
    await writeEntry({
      userId: SYSTEM_ACCOUNTS.SETTLEMENT,
      referenceId,
      type: "cashout_settlement",
      debit: 0,
      credit: net,
      currency: "PHP",
      counterparty: account
    });

    // revenue fee
    await writeEntry({
      userId: SYSTEM_ACCOUNTS.REVENUE,
      referenceId,
      type: "cashout_fee",
      debit: 0,
      credit: fee,
      currency: "PHP",
      counterparty: account
    });

    // -------------------------------
    // STEP 9: FINALIZE TRANSACTION
    // -------------------------------
    tx.status = "settled";
    tx.settlementRef = result.referenceId;

    await tx.save();

    // -------------------------------
    // STEP 10: RETURN RESPONSE
    // -------------------------------
    return {
      success: true,
      referenceId,
      fee,
      net,
      fx,
      providerRef: result.referenceId,
      status: "settled"
    };

  } catch (err) {
    // -------------------------------
    // FAILURE HANDLING
    // -------------------------------
    tx.status = "failed";
    tx.metadata = {
      error: err.message
    };

    await tx.save();

    throw err;
  }
}
