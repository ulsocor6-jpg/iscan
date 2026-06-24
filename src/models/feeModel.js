// src/models/feeModel.js
// Tracks every fee charged across all transaction types.

import mongoose from 'mongoose';

const feeSchema = new mongoose.Schema({
  referenceId: { type: String, required: true, unique: true },
  orderId:     { type: String },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  txType:      {
    type: String,
    enum: ['flower_swap', 'crypto_swap', 'cashout', 'cashin', 'remittance', 'transfer'],
    required: true
  },
  currency:    { type: String, required: true },
  grossAmount: { type: Number, required: true },
  feePercent:  { type: Number, required: true },
  feeAmount:   { type: Number, required: true },
  netAmount:   { type: Number, required: true },
  chain:       { type: String, default: null },
  txHash:      { type: String, default: null },
  status:      { type: String, enum: ['collected', 'refunded'], default: 'collected' },
  metadata:    { type: Object, default: {} }
}, { timestamps: true });

feeSchema.index({ userId: 1, createdAt: -1 });
feeSchema.index({ txType: 1 });
feeSchema.index({ orderId: 1 });

export default mongoose.model('FeeRecord', feeSchema);
