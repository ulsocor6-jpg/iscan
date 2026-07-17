// models/DepositRequest.js
import mongoose from 'mongoose';

const depositRequestSchema = new mongoose.Schema({
  userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  address:           { type: String, required: true, index: true },
  token:             { type: String, required: true }, // contract address, or 'NATIVE'
  amountExpected:    { type: String, required: true }, // store as string, BigInt-safe
  status: {
    type: String,
    enum: ['WAITING', 'DETECTED', 'CONFIRMED', 'CREDITED', 'EXPIRED', 'CANCELLED'],
    default: 'WAITING',
    index: true,
  },
  lastCheckedBlock:  { type: Number, required: true },
  detectedTxHash:    { type: String, default: null, unique: true, sparse: true }, // idempotency guard
  confirmations:     { type: Number, default: 0 },
  expiresAt:         { type: Date, required: true, index: true },
}, { timestamps: true });

export default mongoose.model('DepositRequest', depositRequestSchema);
