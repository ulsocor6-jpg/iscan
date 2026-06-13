import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import User from '../models/userModel.js';
import { WalletService } from '../services/walletService.js'; // ← ADD THIS

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

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

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

    // ─── CREATE INTERNAL WALLET ───────────────────────────────────────────────
    // Every new user gets an internal wallet immediately on registration.
    // Without this, getBalance has no record to query and always returns null.
    await WalletService.createWallet(user._id);
    // ─────────────────────────────────────────────────────────────────────────

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const verifyLink = `${process.env.APP_URL}/api/v1/auth/verify-email?token=${verificationToken}`;

    await transporter.sendMail({
      from: `"ISCAN System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify your ISCAN account',
      html: `
        <h2>Welcome to ISCAN</h2>
        <p>Click below to verify your account:</p>
        <a href="${verifyLink}">Verify Account</a>
      `
    });

    return res.status(201).json({
      success: true,
      message: 'User registered. Please verify your email.'
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
      <a href="/login.html">Go to Login</a>
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

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

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

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        firstName: user.firstName
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('iscan_token', token, {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 86400000
    });

    res.cookie('iscan_email', user.email, {
      sameSite: 'Lax',
      maxAge: 86400000
    });

    res.cookie('iscan_name', `${user.firstName} ${user.lastName}`, {
      sameSite: 'Lax',
      maxAge: 86400000
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName
      }
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
  return res.json({
    success: true,
    user: req.user
  });
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    const resetLink = `${process.env.APP_URL}/reset-password?token=${resetToken}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `"ISCAN Remittance" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset Your ISCAN Password',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:20px;">
          <h2 style="color:#2563eb;">Password Reset Request</h2>
          <p>Click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetLink}" style="display:inline-block;margin:20px 0;padding:14px 28px;background:#2563eb;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
            Reset Password
          </a>
          <p style="color:#9ca3af;font-size:12px;">If you did not request this, ignore this email.</p>
        </div>
      `
    });

    res.json({ message: 'If that email exists, a reset link has been sent.' });

  } catch (err) {
    console.error('[FORGOT PASSWORD ERROR]:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

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
      return res.status(400).json({ message: 'Reset link is invalid or has expired.' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ success: true, message: 'Password reset successful. You can now log in.' });

  } catch (err) {
    console.error('[RESET PASSWORD ERROR]:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};
