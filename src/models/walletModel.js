import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({

  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
    index: true
  },

  // ── BALANCES ──────────────────────────────────────────────────────────────
  // availableBalance  = funds the user can spend right now
  // pendingBalance    = funds held (cashin processing, incoming transfer)
  // frozenBalance     = funds locked by compliance / dispute hold
  // All three are synced from the ledger; never trust these as source of truth
  // for debits — always re-check ledger. These exist for fast display only.

  availableBalance: { type: Number, default: 0, min: 0 },
  pendingBalance:   { type: Number, default: 0, min: 0 },
  frozenBalance:    { type: Number, default: 0, min: 0 },

  // Legacy field — kept for backward compatibility, equals availableBalance
  balance: { type: Number, default: 0, min: 0 },

  currency: { type: String, default: "PHP" },

  status: {
    type: String,
    enum: ["ACTIVE", "SUSPENDED", "FROZEN"],
    default: "ACTIVE"
  },

  // Crypto wallet links (MetaMask, Ronin, etc.)
  cryptoWallets: [
    {
      address:       { type: String },
      provider:      { type: String }, // metamask | ronin | coinbase
      chainId:       { type: String },
      nativeBalance: { type: String },
      nativeToken:   { type: String },
      usdcBalance:   { type: String },
      linkedAt:      { type: Date, default: Date.now }
    }
  ],

  lastSyncedAt: { type: Date, default: null }

}, { timestamps: true });

// Virtual: total balance including pending (for display)
walletSchema.virtual('totalBalance').get(function () {
  return this.availableBalance + this.pendingBalance;
});

// Virtual: ISCAN address derived from _id — no extra field needed
walletSchema.virtual('iscanAddress').get(function () {
  return `ISCAN-${this._id.toString().slice(-10).toUpperCase()}`;
});

walletSchema.set('toJSON', { virtuals: true });
walletSchema.set('toObject', { virtuals: true });

export default mongoose.model("Wallet", walletSchema);
