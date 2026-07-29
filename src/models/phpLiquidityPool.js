import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  currency:       { type: String, default: 'PHP' },
  balance:        { type: Number, default: 0 },      // in PHP
  reserved:       { type: Number, default: 0 },      // locked in pending swaps
  minThreshold:   { type: Number, default: 50000 },  // pause swaps below this
  totalSwappedIn: { type: Number, default: 0 },      // USDC→PHP lifetime volume
  totalSwappedOut:{ type: Number, default: 0 },      // PHP→USDT lifetime volume
  updatedAt:      { type: Date, default: Date.now },
  metadata:       { type: Object, default: {} },     // extra state (pendingIncoming, etc.)
}, { timestamps: true });

schema.virtual('available').get(function () {
  return this.balance - this.reserved;
});

schema.methods.canFulfill = function (phpAmount) {
  return this.available >= phpAmount && this.available - phpAmount >= this.minThreshold;
};

// ── Static: recompute pool totals from TreasuryAccount collection ──────────
import TreasuryAccount from './treasuryAccountModel.js';

schema.statics.recalculateFromAccounts = async function (currency) {
  const agg = await TreasuryAccount.aggregate([
    { $match: { currency, isActive: true } },
    { $group: {
        _id: null,
        totalBalance:    { $sum: '$physicalBalance' },
        totalReserved:   { $sum: '$reserved' },
        totalPendingIn:  { $sum: '$pendingIncoming' },
        totalPendingOut: { $sum: '$pendingOutgoing' },
      }
    }
  ]);
  const data = agg[0] || { totalBalance: 0, totalReserved: 0, totalPendingIn: 0, totalPendingOut: 0 };

  return this.findOneAndUpdate(
    { currency },
    {
      balance:  data.totalBalance,
      reserved: data.totalReserved,
      metadata: {
        pendingIncoming: data.totalPendingIn,
        pendingOutgoing: data.totalPendingOut,
      },
      updatedAt: new Date(),
    },
    { upsert: true }
  );
};

export default mongoose.model('PhpLiquidityPool', schema);
