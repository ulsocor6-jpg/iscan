import Ledger from '../models/ledgerModel.js';

/**
 * SOURCE OF TRUTH BALANCE CALCULATOR
 */
export const getUserBalance = async (userId) => {
  const entries = await Ledger.find({ userId });

  let balance = 0;

  for (const row of entries) {
    balance += Number(row.credit || 0);
    balance -= Number(row.debit || 0);
  }

  return balance;
};
