import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

import User from '../models/userModel.js';
import WalletService from '../services/walletService.js';

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
            <a href="${verifyLink}">Verify Account</a>
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

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        role: user.role
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
        firstName: user.firstName,
        role: user.role
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
