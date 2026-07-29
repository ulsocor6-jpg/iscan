import mongoose from 'mongoose';

// Short-lived proof token minted by verifyOtp() once a code is confirmed.
// Consumed exactly once by requireOtpIfNeeded via consumeVerificationToken().
const otpVerificationTokenSchema = new mongoose.Schema({
    userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose:           { type: String, enum: ['PHONE_VERIFY', 'WITHDRAWAL', 'LOGIN_2FA'], required: true },
    tokenHash:         { type: String, required: true },
    actionFingerprint: { type: String, required: true },
    consumed:          { type: Boolean, default: false },
    expiresAt:         { type: Date, required: true },
    createdAt:         { type: Date, default: Date.now },
});

// Lookup path used by consumeVerificationToken's atomic find+update.
otpVerificationTokenSchema.index({ userId: 1, purpose: 1, tokenHash: 1 });
// TTL cleanup — same pattern as VerificationCode.
otpVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('OtpVerificationToken', otpVerificationTokenSchema);
