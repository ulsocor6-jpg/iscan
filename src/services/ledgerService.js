import Ledger from "../models/ledgerModel.js";

export const LedgerService = {
  async record(entry, session) {
    return await Ledger.create([entry], { session });
  },

  // ── STUB (added by fix_webhook_and_stubs.sh) ─────────────────────────────
  // TODO: implement real crypto-credit ledger entry creation.
  // Expected behaviour: create a ledger entry crediting `cryptoAmount` of
  // the relevant crypto asset to `userId`, referencing `txHash`.
  async creditCrypto(userId, cryptoAmount, txHash) {
    console.warn(
      `[LedgerService.creditCrypto] STUB CALLED - not implemented. ` +
      `userId=${userId} cryptoAmount=${cryptoAmount} txHash=${txHash}`
    );
    return null;
  },
};

export default LedgerService;
