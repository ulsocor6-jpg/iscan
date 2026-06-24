import mongoose from "mongoose";

const flowerLiquidityPoolSchema = new mongoose.Schema(
{
  currency: {
    type: String,
    required: true,
    unique: true,
    enum: ["FLOWER", "USDT"]
  },

  balance: {
    type: Number,
    default: 0
  },

  reserved: {
    type: Number,
    default: 0
  },

  totalSwappedIn: {
    type: Number,
    default: 0
  },

  totalSwappedOut: {
    type: Number,
    default: 0
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

flowerLiquidityPoolSchema.methods.canFulfill = function(amount) {
  return (this.balance - this.reserved) >= amount;
};

export default mongoose.model(
  "FlowerLiquidityPool",
  flowerLiquidityPoolSchema
);
