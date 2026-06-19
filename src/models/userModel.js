import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  firstName:  { type: String, required: true },
  lastName:   { type: String, required: true },
  email:      { type: String, required: true, unique: true },
  password:   { type: String, required: true },
  role:       { type: String, enum: ['user', 'admin'], default: 'user' },

  // ── KYC Tier ──────────────────────────────────────────────────────────
  // unverified : no ID submitted yet         → ₱2,000/day cap
  // partial    : secondary ID + selfie       → ₱20,000/day cap
  // full       : primary gov ID + selfie     → unlimited
  kycTier: {
    type:    String,
    enum:    ['unverified', 'partial', 'full'],
    default: 'unverified',
  },

  isVerified:        { type: Boolean, default: false },
  verificationToken: { type: String, default: null },
  resetPasswordToken:   { type: String, default: null },
  resetPasswordExpires: { type: Date,   default: null },

  linkedWallets: [
    {
      walletId:      { type: String },
      address:       { type: String },
      provider:      { type: String },
      chainId:       { type: String },
      nativeBalance: { type: String },
      nativeToken:   { type: String },
      usdcBalance:   { type: String },
      type:          { type: String },
      accountNumber: { type: String },
      accountName:   { type: String },
      addedAt:       { type: Date, default: Date.now }
    }
  ]
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
export default User;
