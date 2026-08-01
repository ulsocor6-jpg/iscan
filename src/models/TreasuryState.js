import mongoose from 'mongoose';

const treasuryStateSchema = new mongoose.Schema({
  pool:         { type: String, required: true, unique: true },  // e.g., 'GCASH', 'MAYA', 'BANK'
  baseBalance:  { type: Number, default: 0 },
  pendingDeposits: [
    {
      depositId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Deposit' },
      reference:   String,
      amount:      Number,
      user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      expectedAt:  Date,
    }
  ],
  pendingWithdrawals: [
    {
      withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Withdrawal' },
      amount:       Number,
      reserved:     Number,
    }
  ],
  reserved:     { type: Number, default: 0 },   // total reserved for pending withdrawals
  adjustments:  { type: Number, default: 0 },   // manual corrections
  // Expected = baseBalance + ΣpendingDeposits - ΣpendingWithdrawals + adjustments - completedDeposits...
  // We store computed expected for quick access
  expectedBalance: { type: Number, default: 0 },
  lastVerified: { type: Date },
  lastDrift:    { type: Number, default: 0 },
  // Actual balance as of the last laptop proof. Used to compute the delta
  // ("treasuryIncrease") between proofs, so a specific pending deposit can
  // be matched to a specific movement instead of waiting for the pool's
  // full pending sum to clear. Null until the first proof arrives.
  lastKnownActual: { type: Number, default: null },
}, { timestamps: true });

export default mongoose.model('TreasuryState', treasuryStateSchema);
