import mongoose from 'mongoose';

const treasurySnapshotSchema = new mongoose.Schema({
  pool:          { type: String, required: true },
  baseBalance:   Number,
  pendingDeposits: [{ depositId: mongoose.Schema.Types.ObjectId, amount: Number, reference: String }],
  pendingWithdrawals: [{ withdrawalId: mongoose.Schema.Types.ObjectId, amount: Number }],
  adjustments:   Number,
  expectedBalance: Number,
  actualBalance: Number,      // from laptop verifier
  drift:         Number,
  integrityScore: Number,     // 0-100
  proof:         { type: mongoose.Schema.Types.Mixed },  // signed proof from laptop
  verifiedAt:    Date,
}, { timestamps: true });

export default mongoose.model('TreasurySnapshot', treasurySnapshotSchema);
