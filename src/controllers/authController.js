import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import User from '../models/userModel.js';
import { WalletService } from '../services/walletService.js';

/* ─── EMAIL TRANSPORTER ────────────────────────────────────────────────────── */
const getTransporter = () => nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

/* =========================
   REGISTER
========================= */
export const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password)
      return res.status(400).json({ message: 'All fields are required.' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(400).json({ message: 'Email already registered.' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      verificationToken,
      isVerified: false
    });

    await WalletService.createWallet(user._id);

    try {
      const verifyLink = `${process.env.APP_URL}/api/v1/auth/verify-email?token=${verificationToken}`;
      await getTransporter().sendMail({
        from: `"ISCAN System" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify your ISCAN account',
        html: `<h2>Welcome to ISCAN</h2><p>Click below to verify your account:</p>
               <a href="${verifyLink}">Verify Account</a>`
      });
    } catch (mailErr) {
      console.warn('[REGISTER] Email send failed (non-fatal):', mailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Registered successfully. Please verify your email before logging in.'
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
    if (!token) return res.status(400).send('Invalid verification link');

    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).send('Invalid or expired token');

    user.isVerified = true;
    user.verificationToken = null;
    await user.save();

    return res.send(`
      <h2 style="font-family:sans-serif;color:#00d4ff">Email Verified ✓</h2>
      <p style="font-family:sans-serif">You can now <a href="/login">log in</a>.</p>
    `);

  } catch (error) {
    console.error('[VERIFY ERROR]', error);
    return res.status(500).send('Verification failed');
  }
};

/* =========================
   LOGIN
========================= */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ message: 'Invalid email or password.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ message: 'Invalid email or password.' });

    // TEMP: bypass email verification for development
// if (!user.isVerified)
//   return res.status(403).json({
//     message: 'Email not verified. Check your inbox or use Forgot Password to resend.'
//   });

    const token = jwt.sign(
      { id: user._id, email: user.email, firstName: user.firstName },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const cookieOpts = { httpOnly: false, sameSite: 'Lax', maxAge: 86400000 };

    res.cookie('iscan_token', token, { ...cookieOpts, httpOnly: true });
    res.cookie('iscan_email', user.email, cookieOpts);
    res.cookie('iscan_name', `${user.firstName} ${user.lastName}`, cookieOpts);

    return res.json({
      success: true,
      user: { id: user._id, email: user.email, firstName: user.firstName }
    });

  } catch (error) {
    console.error('[LOGIN ERROR]', error);
    return res.status(500).json({ message: 'Login failed.' });
  }
};

/* =========================
   LOGOUT
========================= */
export const logout = (req, res) => {
  res.clearCookie('iscan_token');
  res.clearCookie('iscan_email');
  res.clearCookie('iscan_name');
  return res.json({ success: true });
};

/* =========================
   VERIFY TOKEN
========================= */
export const verify = async (req, res) => {
  return res.json({ success: true, user: req.user });
};

/* =========================
   FORGOT PASSWORD
========================= */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ message: 'Email required.' });

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return success — don't leak whether email exists
    if (!user)
      return res.json({ success: true });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = Date.now() + 3600000; // 1 hour

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetExpiry;
    await user.save();

    try {
      const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
      await getTransporter().sendMail({
        from: `"ISCAN System" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Reset your ISCAN password',
        html: `
          <h2>Password Reset</h2>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetLink}">Reset Password</a>
          <p>If you didn't request this, ignore this email.</p>
        `
      });
    } catch (mailErr) {
      console.warn('[FORGOT] Email send failed:', mailErr.message);
    }

    return res.json({ success: true });

  } catch (error) {
    console.error('[FORGOT ERROR]', error);
    return res.status(500).json({ message: 'Failed to process request.' });
  }
};

/* =========================
   RESET PASSWORD
========================= */
export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password)
      return res.status(400).json({ message: 'Token and password required.' });

    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user)
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.isVerified = true; // auto-verify on password reset
    await user.save();

    return res.json({ success: true, message: 'Password reset successfully. You can now log in.' });

  } catch (error) {
    console.error('[RESET ERROR]', error);
    return res.status(500).json({ message: 'Reset failed.' });
  }
};
