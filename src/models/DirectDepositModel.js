import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  referenceId: { type: String, required: true, unique: true },
  amount:      { type: Number, required: true },
  status:      { type: String, enum: ['PENDING', 'CREDITED', 'EXPIRED'], default: 'PENDING' },
  channel:     { type: String, enum: ['GCASH', 'BANK', 'MAYA'], default: 'GCASH' },
  senderName:  { type: String },
  creditedAt:  { type: Date },
  expiresAt:   { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  adminNote:   { type: String }
}, { timestamps: true });

export default mongoose.model('DirectDeposit', schema);
