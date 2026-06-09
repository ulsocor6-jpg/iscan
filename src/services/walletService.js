

import Wallet from "../models/walletModel.js";
import Ledger from "../ledger/ledgerModel.js";

export const getWalletBalance = async (userId) => {
  const wallet = await Wallet.findOne({ userId });

  const ledgerBalance = await Ledger.calculateBalance(userId);

  // sync cache (not authority)
  wallet.balanceCache = ledgerBalance;
  wallet.lastLedgerSync = new Date();
  await wallet.save();

  return wallet;
};
import { createWallet } from "../models/walletModel.js";
import { credit, debit, getBalance } from "./ledgerService.js";

export const initWallet = (userId) => {
  return createWallet(userId);
};

export const getWalletBalance = (userId) => {
  return {
    userId,
    balance: getBalance(userId)
  };
};

export const cashIn = ({ userId, amount, referenceId, source }) => {
  credit({ userId, amount, source, referenceId });
};

export const cashOut = ({ userId, amount, referenceId, source }) => {
  debit({ userId, amount, source, referenceId });
};
