#!/usr/bin/env bash
# ISCAN — Login OTP + instant old-session revocation patch
# Run from the repo root: ~/Desktop/iscansystem
set -e

if [ ! -f "src/routes/authRoutes.js" ]; then
  echo "ERROR: run this from the iscansystem repo root (src/routes/authRoutes.js not found here)."
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=".patch-backup-$STAMP"
mkdir -p "$BACKUP_DIR"

echo "==> Backing up files to $BACKUP_DIR"
cp src/controllers/authController.js "$BACKUP_DIR/authController.js.bak"
cp src/auth/middleware/authMiddleware.js "$BACKUP_DIR/authMiddleware.js.bak"
cp src/routes/authRoutes.js "$BACKUP_DIR/authRoutes.js.bak"
cp src/services/actionVerificationService.js "$BACKUP_DIR/actionVerificationService.js.bak"

echo "==> Writing new src/controllers/authController.js"
cat > src/controllers/authController.js << 'AUTHCONTROLLER_EOF'
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

import User from '../models/userModel.js';
import WalletService from '../services/walletService.js';
import eventStreamService from '../services/eventStreamService.js';
import SessionService from "../auth/services/sessionService.js";

import sessionContextCollector from "../auth/intelligence/sessionContextCollector.js";
import sessionRiskAnalyzer from "../auth/intelligence/sessionRiskAnalyzer.js";
import sessionIntelligencePublisher from "../auth/intelligence/sessionIntelligencePublisher.js";

import buildFingerprint from "../auth/services/deviceFingerprint.js";
import SessionEvents from "../auth/services/sessionEvents.js";

import { sendOtp, verifyOtp } from '../services/actionVerificationService.js';
import SessionRegistryService from '../auth/services/sessionRegistryService.js';
import { addAuditLog } from '../services/auditService.js';

const LOGIN_OTP_TICKET_TTL = '10m';


/* =========================
   REGISTER
========================= */
export const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = email.toLowerCase();

    console.log('[REGISTER] step: checking existing user...');
    const existing = await User.findOne({ email: normalizedEmail });
    console.log('[REGISTER] step: existing check done');
    if (existing) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    console.log('[REGISTER] step: hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('[REGISTER] step: password hashed');
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // 1. Create user
    console.log('[REGISTER] step: creating user...');
    const user = await User.create({
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      verificationToken,
      isVerified: false
    });

    console.log('[REGISTER] step: user created, id=', user._id);

    // 2. CREATE OR GET WALLET (SOURCE OF TRUTH)
    console.log('[REGISTER] step: creating wallet...');
    const wallet = await WalletService.getOrCreateWallet(user._id);
    console.log('[REGISTER] step: wallet created, id=', wallet._id);

    // 3. Link wallet to user
    console.log('[REGISTER] step: linking wallet to user...');
    await User.findByIdAndUpdate(user._id, {
      walletId: wallet._id
    });
    console.log('[REGISTER] step: wallet linked');

    console.log('[REGISTER] step: about to send email...');
    // 4. Send verification email (non-blocking - registration must not fail/hang if email fails)
    const verifyLink = `${process.env.APP_URL}/api/v1/auth/verify-email?token=${verificationToken}`;

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000
      });

      await transporter.sendMail({
        from: `"ISCAN System" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: 'Verify your ISCAN account',
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Welcome to ISCAN</h2>
            <p>Verify your account to activate your wallet.</p>
            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px"><a href="${verifyLink}" style="background-color:#4F46E5;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-family:Arial,sans-serif;font-size:16px;display:inline-block">Verify Account</a></td></tr></table><p style="font-family:Arial,sans-serif;color:#666">Or copy this link: ${verifyLink}</p>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('[REGISTER] Verification email failed to send (continuing):', emailErr.message);
    }
    console.log('[REGISTER] step: email step done, sending response...');

    return res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email.',
      wallet: {
        id: wallet._id,
        address: wallet.iscanAddress
      }
    });

  } catch (error) {
    console.error('[REGISTER ERROR]', error);
    return res.status(500).json({ message: 'Registration failed.' });
  }
};

/* =========================
   EMAIL VERIFICATION
========================= */
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).send('Invalid verification link');
    }

    const user = await User.findOne({ verificationToken: token });

    if (!user) {
      return res.status(400).send('Invalid or expired token');
    }

    user.isVerified = true;
    user.verificationToken = null;

    await user.save();

    return res.send(`
      <h2>Email Verified Successfully</h2>
      <a href="/login">Go to Login</a>
    `);

  } catch (error) {
    console.error('[VERIFY ERROR]', error);
    return res.status(500).send('Verification failed');
  }
};

/* =========================
   LOGIN — step 1: password check, send login OTP
   No session is created and no cookie/token with API access is issued
   here. Only a short-lived pre-auth ticket goes back to the client,
   scoped to type "login_otp" — requireAuth rejects any token without a
   sessionId, so this ticket can never be used to hit a protected route.
========================= */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required.' });
    }

    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email first.' });
    }

    if (user.accountStatus && user.accountStatus !== 'ACTIVE') {
      return res.status(403).json({ message: 'Account is not active.' });
    }

    await sendOtp(user._id, 'LOGIN');

    const ticket = jwt.sign(
      {
        id: user._id,
        type: 'login_otp'
      },
      process.env.JWT_SECRET,
      {
        expiresIn: LOGIN_OTP_TICKET_TTL
      }
    );

    return res.status(202).json({
      success: true,
      requiresOtp: true,
      ticket,
      message: 'A verification code has been sent to your email.'
    });

  } catch (error) {
    console.error('[LOGIN ERROR]', error);
    return res.status(500).json({ message: error.message || 'Login failed.' });
  }
};

/* =========================
   LOGIN — step 2: verify OTP, revoke old session(s) instantly,
   then create the new session and issue the real auth cookie/token.
========================= */
export const verifyLoginOtp = async (req, res) => {
  try {
    const { ticket, code } = req.body;

    if (!ticket || !code) {
      return res.status(400).json({ message: 'Ticket and code are required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(ticket, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Verification expired. Please log in again.' });
    }

    if (decoded.type !== 'login_otp') {
      return res.status(401).json({ message: 'Invalid ticket.' });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'Account unavailable.' });
    }

    if (user.accountStatus && user.accountStatus !== 'ACTIVE') {
      return res.status(401).json({ message: 'Account unavailable.' });
    }

    try {
      await verifyOtp(user._id, code, 'LOGIN', {});
    } catch (err) {
      return res.status(401).json({ message: err.message || 'Invalid code.' });
    }

/*
|--------------------------------------------------------------------------
| OTP confirmed — revoke any existing session(s) instantly, no delay.
| This is the single-session-per-account enforcement point.
|--------------------------------------------------------------------------
*/

    const oldSessions = await SessionRegistryService.getActiveSessions(user._id);

    await SessionService.revokeAllUserSessions(user._id);

    for (const old of oldSessions) {
      await SessionEvents.revoked(old);

      try {
        await addAuditLog(user._id, 'SESSION_REPLACED', {
          oldSessionId: old.sessionId,
          oldIp: old.network?.ip,
          oldDevice: old.device?.browser,
          newIp: req.ip
        });
      } catch (auditErr) {
        console.warn('[VERIFY LOGIN OTP] audit log failed:', auditErr.message);
      }
    }

/*
|--------------------------------------------------------------------------
| Create Login Session
|--------------------------------------------------------------------------
*/

    const device = buildFingerprint(req);

    const session = await SessionService.createSession({

        userId: user._id,

        fingerprint: device.fingerprint,

        browser: device.browser,

        os: device.os,

        platform: device.platform,

        userAgent: device.userAgent,

        ip: device.ip,

        emailVerified: user.isVerified,

        phoneVerified: !!user.phoneVerified,

        otpVerified: true

    });

    // ===== Session Intelligence =====
    const sessionContext =
        sessionContextCollector.collect(req, session);

    const sessionRisk =
        sessionRiskAnalyzer.analyze(sessionContext);

    sessionIntelligencePublisher.publish(
        sessionContext,
        sessionRisk
    );

    await SessionEvents.created(session);

    const token = jwt.sign(
    {
        id: user._id,
        sessionId: session.sessionId,
        email: user.email,
        firstName: user.firstName,
        role: user.role
    },
    process.env.JWT_SECRET,
    {
        expiresIn: "1d"
    }
    );

    res.cookie('iscan_token', token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400000
    });

    res.cookie('iscan_email', user.email, {
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400000
    });

    res.cookie('iscan_name', `${user.firstName} ${user.lastName}`, {
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 86400000
    });

    await eventStreamService.emit('auth.login', {
      userId: String(user._id),
      email: user.email,
      role: user.role
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        role: user.role
      }
    });

  } catch (error) {
    console.error('[VERIFY LOGIN OTP ERROR]', error);
    return res.status(500).json({ message: 'Verification failed.' });
  }
};

/* =========================
   LOGIN — resend OTP
========================= */
export const resendLoginOtp = async (req, res) => {
  try {
    const { ticket } = req.body;

    if (!ticket) {
      return res.status(400).json({ message: 'Ticket is required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(ticket, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Verification expired. Please log in again.' });
    }

    if (decoded.type !== 'login_otp') {
      return res.status(401).json({ message: 'Invalid ticket.' });
    }

    await sendOtp(decoded.id, 'LOGIN');

    return res.json({ success: true, message: 'Code resent.' });

  } catch (error) {
    console.error('[RESEND LOGIN OTP ERROR]', error);
    return res.status(400).json({ message: error.message || 'Could not resend code.' });
  }
};

/* =========================
   LOGOUT
========================= */
export const logout = async (req, res) => {

  try {

    const token = req.cookies?.iscan_token;

    if (token) {

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      if (decoded.sessionId) {

        const session = await SessionService.logoutSession(
          decoded.sessionId
        );

        if (session) {
          await SessionEvents.logout(session);
        }

      }

    }

  } catch (err) {
    console.warn("[LOGOUT]", err.message);
  }

  const cookieOpts = {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production"
  };

  res.clearCookie("iscan_token", cookieOpts);

  res.clearCookie("iscan_email", {
    sameSite: "Lax",
    secure: cookieOpts.secure
  });

  res.clearCookie("iscan_name", {
    sameSite: "Lax",
    secure: cookieOpts.secure
  });

  return res.json({
    success: true
  });

};

/* =========================
   EXIT IMPERSONATION
   Restores the admin's own session from the stashed iscan_admin_token
   cookie. Requires that cookie to hold a still-valid admin JWT — if it's
   missing or expired, the admin simply has to log back in normally.
========================= */
export const exitImpersonation = (req, res) => {
  const adminToken = req.cookies?.iscan_admin_token;

  if (!adminToken) {
    return res.status(400).json({ success: false, message: 'Not currently impersonating.' });
  }

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 86400000
  };

  let decoded;
  try {
    decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
  } catch (err) {
    res.clearCookie("iscan_admin_token", cookieOpts);
    return res.status(401).json({ success: false, message: 'Admin session expired. Please log in again.' });
  }

  res.cookie('iscan_token', adminToken, cookieOpts);
  res.cookie('iscan_email', decoded.email, { sameSite: 'Lax', secure: cookieOpts.secure, maxAge: cookieOpts.maxAge });
  res.cookie('iscan_name', decoded.firstName || '', { sameSite: 'Lax', secure: cookieOpts.secure, maxAge: cookieOpts.maxAge });
  res.clearCookie("iscan_admin_token", cookieOpts);

  eventStreamService.emit('admin.impersonation_end', {
    userId: String(req.user?.id || ''),
    adminId: decoded.id,
    adminEmail: decoded.email
  }).catch(() => {});

  return res.json({ success: true });
};

/* =========================
   VERIFY SESSION
========================= */
export const verify = async (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
};

/* =========================
   FORGOT PASSWORD
========================= */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const normalizedEmail = email.toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    // always return same response (security)
    if (!user) {
      return res.json({
        message: 'If that email exists, a reset link has been sent.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"ISCAN Security" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: 'Reset Your ISCAN Password',
      html: `
        <h2>Password Reset</h2>
        <p>Click below to reset your password (valid for 1 hour)</p>
        <a href="${resetLink}">Reset Password</a>
      `
    });

    return res.json({
      message: 'If that email exists, a reset link has been sent.'
    });

  } catch (error) {
    console.error('[FORGOT PASSWORD ERROR]', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/* =========================
   RESET PASSWORD
========================= */
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Reset link is invalid or expired.' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    return res.json({
      success: true,
      message: 'Password reset successful.'
    });

  } catch (error) {
    console.error('[RESET PASSWORD ERROR]', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/* =========================
   RESEND VERIFICATION
========================= */
export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: 'If that email exists, a verification link has been sent.' });
    if (user.isVerified) return res.status(400).json({ message: 'Account is already verified.' });
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    await user.save();
    const verifyLink = `${process.env.APP_URL}/api/v1/auth/verify-email?token=${verificationToken}`;
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 5000 });
    await transporter.sendMail({
      from: `"ISCAN System" <${process.env.EMAIL_USER}>`,
      to: email.toLowerCase(),
      subject: 'Verify your ISCAN account',
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto"><h2 style="color:#4F46E5">Verify your ISCAN account</h2><p>Click the button below to verify your email address.</p><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px"><a href="${verifyLink}" style="background-color:#4F46E5;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-family:Arial,sans-serif;font-size:16px;display:inline-block">Verify Account</a></td></tr></table><p style="color:#666;font-size:13px">Or copy this link into your browser:</p><p style="word-break:break-all;color:#4F46E5;font-size:13px">${verifyLink}</p><hr style="border:none;border-top:1px solid #eee;margin:24px 0"><p style="color:#999;font-size:12px">If you didn't create an ISCAN account, ignore this email.</p></div>`
    });
    return res.json({ message: 'If that email exists, a verification link has been sent.' });
  } catch (error) {
    console.error('[RESEND VERIFICATION ERROR]', error);
    return res.status(500).json({ message: 'Server error.' });
  }
};
AUTHCONTROLLER_EOF

echo "==> Patching src/auth/middleware/authMiddleware.js (close no-sessionId gap)"
python3 << 'PYEOF'
import re

path = "src/auth/middleware/authMiddleware.js"
with open(path) as f:
    content = f.read()

old = """if (decoded.sessionId) {

    const session = await SessionService.findSession(
        decoded.sessionId
    );

    if (!session) {
        return res.status(401).json({
            success: false,
            message: "Session not found."
        });
    }

    if (session.status !== "ACTIVE") {
        return res.status(401).json({
            success: false,
            message: "Session is no longer active."
        });
    }

    await SessionService.touchSession(
        decoded.sessionId
    );

}"""

new = """if (decoded.sessionId) {

    const session = await SessionService.findSession(
        decoded.sessionId
    );

    if (!session) {
        return res.status(401).json({
            success: false,
            message: "Session not found."
        });
    }

    if (session.status !== "ACTIVE") {
        return res.status(401).json({
            success: false,
            message: "Session is no longer active."
        });
    }

    await SessionService.touchSession(
        decoded.sessionId
    );

} else {

    // Every real login issues a sessionId. A token without one (e.g. a
    // login-OTP pre-auth ticket) must never grant API access.
    return res.status(401).json({
        success: false,
        message: "Invalid token."
    });

}"""

if old not in content:
    raise SystemExit("PATCH FAILED: authMiddleware.js — expected block not found, file may have changed. No changes written.")

content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("authMiddleware.js patched OK")
PYEOF

echo "==> Patching src/routes/authRoutes.js (register new login-OTP routes)"
python3 << 'PYEOF'
path = "src/routes/authRoutes.js"
with open(path) as f:
    content = f.read()

old_import = """import {
  register,
  login,
  logout,
  verify,
  verifyEmail,
  forgotPassword,
  resetPassword,
  resendVerification,
  exitImpersonation
} from '../controllers/authController.js';"""

new_import = """import {
  register,
  login,
  verifyLoginOtp,
  resendLoginOtp,
  logout,
  verify,
  verifyEmail,
  forgotPassword,
  resetPassword,
  resendVerification,
  exitImpersonation
} from '../controllers/authController.js';"""

if old_import not in content:
    raise SystemExit("PATCH FAILED: authRoutes.js — import block not found. No changes written.")

content = content.replace(old_import, new_import, 1)

old_route = "router.post('/login', loginLimiter, login);"
new_route = """router.post('/login', loginLimiter, login);
router.post('/login/verify-otp', authActionLimiter, verifyLoginOtp);
router.post('/login/resend-otp', authActionLimiter, resendLoginOtp);"""

if old_route not in content:
    raise SystemExit("PATCH FAILED: authRoutes.js — login route line not found. No changes written.")

content = content.replace(old_route, new_route, 1)

with open(path, "w") as f:
    f.write(content)

print("authRoutes.js patched OK")
PYEOF

echo "==> Patching src/services/actionVerificationService.js (LOGIN email copy)"
python3 << 'PYEOF'
path = "src/services/actionVerificationService.js"
with open(path) as f:
    content = f.read()

old = """    const subject = purpose === 'WITHDRAWAL' ? 'iScan withdrawal verification' : 'iScan verification code';
    const html = `<p>Your verification code is: <strong>${otp}</strong></p><p>It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`;
    await sendEmail(user.email, subject, html);"""

new = """    const subject = purpose === 'WITHDRAWAL' ? 'iScan withdrawal verification'
                   : purpose === 'LOGIN' ? 'Your ISCAN login code'
                   : 'iScan verification code';
    const html = purpose === 'LOGIN'
        ? `<p>Someone is signing in to your ISCAN account. Your code is: <strong>${otp}</strong></p><p>It expires in ${OTP_EXPIRY_MINUTES} minutes. If this wasn't you, ignore this email — login cannot complete without this code, so your account stays safe.</p>`
        : `<p>Your verification code is: <strong>${otp}</strong></p><p>It expires in ${OTP_EXPIRY_MINUTES} minutes.</p>`;
    await sendEmail(user.email, subject, html);"""

if old not in content:
    raise SystemExit("PATCH FAILED: actionVerificationService.js — expected block not found. No changes written.")

content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("actionVerificationService.js patched OK")
PYEOF

echo ""
echo "==> Sanity checks (non-fatal warnings only)"

if [ -f "src/models/verificationCodeModel.js" ]; then
  if grep -q "enum" src/models/verificationCodeModel.js && ! grep -q "LOGIN" src/models/verificationCodeModel.js; then
    echo "WARNING: src/models/verificationCodeModel.js has an enum on 'purpose' that doesn't list LOGIN yet."
    echo "         Add 'LOGIN' to that enum or sendOtp(..., 'LOGIN') will fail schema validation."
  fi
fi

if [ -f "src/models/otpVerificationTokenModel.js" ]; then
  if grep -q "enum" src/models/otpVerificationTokenModel.js && ! grep -q "LOGIN" src/models/otpVerificationTokenModel.js; then
    echo "WARNING: src/models/otpVerificationTokenModel.js has an enum on 'purpose' that doesn't list LOGIN yet."
    echo "         Add 'LOGIN' to that enum or verifyOtp(..., 'LOGIN') will fail schema validation."
  fi
fi

echo ""
echo "==> Done. Backups saved in $BACKUP_DIR"
echo ""
echo "Frontend changes still needed (not touched by this script):"
echo "  - Login form: on 202 { requiresOtp: true, ticket }, show an OTP input screen"
echo "  - Submit code -> POST /api/v1/auth/login/verify-otp { ticket, code }"
echo "  - 'Resend code' -> POST /api/v1/auth/login/resend-otp { ticket }"
echo "  - On success there, save the returned token/cookie same as before"
echo ""
echo "Restart your server (or let nodemon reload) to pick up the changes."
