import Ledger from "../models/ledgerModel.js";

export const LedgerService = {
  async record(entry, session) {
    return await Ledger.create([entry], { session });
  }
};
