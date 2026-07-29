import mongoose from 'mongoose';

const verificationCodeSchema = new mongoose.Schema({
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    codeHash:  { type: String, required: true },
    purpose:   { type: String, enum: ['PHONE_VERIFY', 'WITHDRAWAL', 'LOGIN_2FA'], required: true },
    expiresAt: { type: Date, required: true },
    attempts:  { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('VerificationCode', verificationCodeSchema);
