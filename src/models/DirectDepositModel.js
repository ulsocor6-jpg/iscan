import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referenceId: { type: String, required: true, unique: true },
  amount:      { type: Number, required: true },
  status: { type: String, enum: ['PENDING','CREDITED','EXPIRED','PENDING_REVIEW','ADMIN_APPROVED','ADMIN_REJECTED'], default: 'PENDING' },
  channel:     { type: String, enum: ['GCASH', 'BANK', 'MAYA'], default: 'GCASH' },
  senderName:  { type: String },
  creditedAt:  { type: Date },
  expiresAt:   { type: Date, default: () => new Date(Date.now() + 3 * 60 * 1000) },
  adminNote:   { type: String },

  verificationResult: {
    type: String,
    enum: [
      'MATCHED',
      'AMOUNT_MISMATCH',
      'SENDER_MISMATCH',
      'NO_ACTIVE_REQUEST',
      'MULTIPLE_MATCHES',
      'MANUAL_REVIEW'
    ]
  }
}, { timestamps: true });


schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("DirectDeposit", schema);
