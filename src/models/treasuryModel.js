import mongoose from "mongoose";

const treasurySchema = new mongoose.Schema({
  asset: {
    type: String,
    enum: ["USDC", "USDT"],
    unique: true,
    required: true
  },

  balance: {
    type: Number,
    default: 0
  },

  reserved: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true
});

export default mongoose.model("Treasury", treasurySchema);
