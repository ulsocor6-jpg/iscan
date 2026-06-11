import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema({
  referenceId: { type: String, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  transactionType: { type: String, enum: ['credit', 'debit'], required: true },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  currency: { type: String, default: 'PHP' },
  description: String,
  status: { type: String, default: 'completed' },
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Prevent double-spend via unique referenceId + type
ledgerSchema.index({ referenceId: 1, transactionType: 1 }, { unique: true });

export default mongoose.model('Ledger', ledgerSchema);
