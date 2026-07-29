import crypto from 'crypto';
import bcrypt from 'bcrypt';
import VerificationCode from '../models/verificationCodeModel.js';
import OtpVerificationToken from '../models/otpVerificationTokenModel.js';
import User from '../models/userModel.js';
import { sendEmail } from './emailService.js';
import { addAuditLog } from './auditService.js';
import eventStreamService from './eventStreamService.js';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3', 10);

// How long a "verified" proof token is good for before it must be re-earned.
// Kept short and separate from OTP_EXPIRY_MINUTES on purpose — this is the
// window during which the *result* of verification can be used, not the
// window during which the code itself is valid.
const VERIFICATION_TOKEN_TTL_MINUTES = parseInt(process.env.OTP_TOKEN_TTL_MINUTES || '2', 10);

// Minimum gap between OTP send requests for the same user+purpose, to stop
// send-spam / inbox flooding.
const OTP_RESEND_COOLDOWN_SECONDS = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '30', 10);

function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

async function hashOTP(otp) {
    return bcrypt.hash(otp, 10);
}

/**
 * Builds a stable fingerprint of the action being verified, so a proof
 * token minted for one action can't be replayed against a different one
 * (e.g. verified for a $500 withdrawal, then reused for $50,000).
 *
 * actionParams should contain whatever uniquely identifies the action —
 * for withdrawals, at minimum the amount; include destination/currency
 * too if your flow has them.
 */
function fingerprintAction(actionParams = {}) {
    const normalized = JSON.stringify(actionParams, Object.keys(actionParams).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

export async function sendOtp(userId, purpose) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Cooldown check — block rapid repeat sends for the same user+purpose.
    const recent = await VerificationCode.findOne({ userId, purpose }).sort({ createdAt: -1 });
    if (recent) {
        const secondsSinceLast = (Date.now() - recent.createdAt.getTime()) / 1000;
        if (secondsSinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
            const wait = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLast);
            throw new Error(`Please wait ${wait}s before requesting another code`);
        }
    }

    await VerificationCode.deleteMany({ userId, purpose });

    const otp = generateOTP();
    const codeHash = await hashOTP(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await VerificationCode.create({ userId, codeHash, purpose, expiresAt });

    const subject = purpose === 'WITHDRAWAL' ? 'iScan withdrawal verification' : 'iScan verification code';
    const html = `<p>Your verification code is: <strong>${otp}</strong></p><p>It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`;
    await sendEmail(user.email, subject, html);

    await addAuditLog(userId, 'OTP_SENT', { purpose });
    eventStreamService.emit('user.otp.sent', { userId, purpose });

    return true;
}

/**
 * Verifies the OTP code. On success, mints and returns a single-use proof
 * token bound to the given action params. That token — not a client
 * boolean — is what requireOtpIfNeeded will later check.
 *
 * @returns {Promise<string>} the raw verification token to hand to the client
 */
export async function verifyOtp(userId, code, purpose, actionParams = {}) {
    const record = await VerificationCode.findOne({ userId, purpose }).sort({ createdAt: -1 });
    if (!record) throw new Error('No OTP requested');

    if (new Date() > record.expiresAt) {
        await VerificationCode.deleteOne({ _id: record._id });
        throw new Error('OTP expired');
    }

    if (record.attempts >= MAX_ATTEMPTS) {
        throw new Error('Too many attempts. Please request a new code.');
    }

    const isValid = await bcrypt.compare(code, record.codeHash);
    if (!isValid) {
        record.attempts += 1;
        await record.save();
        await addAuditLog(userId, 'OTP_VERIFY_FAILED', {
            purpose,
            attempts: record.attempts,
        });
        if (record.attempts >= MAX_ATTEMPTS) {
            await VerificationCode.deleteOne({ _id: record._id });
            await addAuditLog(userId, 'OTP_LOCKED_OUT', { purpose });
        }
        throw new Error('Invalid OTP');
    }

    await VerificationCode.deleteOne({ _id: record._id });

    // Mint the proof token. Raw token goes to the client; only its hash
    // is stored, same pattern as the OTP itself.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const actionFingerprint = fingerprintAction(actionParams);
    const tokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MINUTES * 60 * 1000);

    await OtpVerificationToken.create({
        userId,
        purpose,
        tokenHash,
        actionFingerprint,
        expiresAt: tokenExpiresAt,
    });

    await addAuditLog(userId, 'OTP_VERIFIED', { purpose });
    eventStreamService.emit('user.otp.verified', { userId, purpose });

    return rawToken;
}

/**
 * Consumes a verification proof token. Called by requireOtpIfNeeded,
 * never trusted from a plain client boolean.
 *
 * Single-use: marks the token consumed atomically so it can't be replayed,
 * even if the same request is somehow sent twice.
 */
export async function consumeVerificationToken(userId, purpose, rawToken, actionParams = {}) {
    if (!rawToken || typeof rawToken !== 'string') return false;

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const actionFingerprint = fingerprintAction(actionParams);

    // findOneAndUpdate with consumed:false in the filter makes the
    // "check + mark used" step atomic — no race where two concurrent
    // requests both pass using the same token.
    const record = await OtpVerificationToken.findOneAndUpdate(
        {
            userId,
            purpose,
            tokenHash,
            actionFingerprint,
            consumed: false,
            expiresAt: { $gt: new Date() },
        },
        { $set: { consumed: true } },
        { new: true }
    );

    return !!record;
}
