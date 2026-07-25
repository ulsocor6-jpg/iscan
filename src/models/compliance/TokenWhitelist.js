import mongoose from "mongoose";

const tokenWhitelistSchema = new mongoose.Schema({
  symbol:   { type: String, required: true, unique: true },
  address:  { type: String, required: true },             // checksummed address
  chain:    { type: String, default: "base" },
  addedBy:  { type: String, default: "system" },
}, { timestamps: true });

// Prevent duplicate symbols
tokenWhitelistSchema.index({ symbol: 1 }, { unique: true });

const TokenWhitelist = mongoose.model("TokenWhitelist", tokenWhitelistSchema);
export default TokenWhitelist;
