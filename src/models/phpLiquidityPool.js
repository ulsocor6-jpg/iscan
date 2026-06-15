import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  currency:       { type: String, default: 'PHP' },
  balance:        { type: Number, default: 0 },      // in PHP
  reserved:       { type: Number, default: 0 },      // locked in pending swaps
  minThreshold:   { type: Number, default: 50000 },  // pause swaps below this
  totalSwappedIn: { type: Number, default: 0 },      // USDC→PHP lifetime volume
  totalSwappedOut:{ type: Number, default: 0 },      // PHP→USDT lifetime volume
  updatedAt:      { type: Date, default: Date.now },
}, { timestamps: true });

schema.virtual('available').get(function () {
  return this.balance - this.reserved;
});

schema.methods.canFulfill = function (phpAmount) {
  return this.available >= phpAmount && this.available - phpAmount >= this.minThreshold;
};

export default mongoose.model('PhpLiquidityPool', schema);
