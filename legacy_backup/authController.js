import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import User from '../models/userModel.js';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      verificationToken,
      isVerified: false
    });

    const verifyLink = `${process.env.APP_URL}/api/v1/auth/verify?token=${verificationToken}`;

    await transporter.sendMail({
      from: `"ISCAN Remittance" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your ISCAN Account',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;">
          <h2>Welcome to ISCAN, ${firstName}!</h2>
          <p>Click the button below to verify your email and activate your account.</p>
          <a href="${verifyLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;">Verify My Account</a>
          <p style="margin-top:20px;color:#666;font-size:12px;">If you did not register for ISCAN, ignore this email.</p>
        </div>
      `
    });

    res.json({ message: `Verification email sent to ${email}. Please check your inbox.` });

  } catch (err) {
    console.error('[REGISTER ERROR]:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

export const verify = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send('<h2>Invalid verification link.</h2>');

    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).send('<h2>Link is invalid or already used.</h2>');

    user.isVerified = true;
    user.verificationToken = null;
    await user.save();

    res.send(`
      <div style="font-family:Arial,sans-serif;text-align:center;margin-top:80px;">
        <h1 style="color:#16a34a;">✅ Email Verified!</h1>
        <p>Your ISCAN account is now active.</p>
        <a href="/login.html" style="color:#2563eb;">Go to Login</a>
      </div>
    `);
  } catch (err) {
    console.error('[VERIFY ERROR]:', err);
    res.status(500).send('<h2>Server error during verification.</h2>');
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email before logging in.' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, firstName: user.firstName },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Set httpOnly cookie for auth
    res.cookie('iscan_token', token, {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 2 * 60 * 60 * 1000
    });

    // Set readable cookies for frontend display
    res.cookie('iscan_email', user.email, {
      sameSite: 'Lax',
      maxAge: 2 * 60 * 60 * 1000
    });
    res.cookie('iscan_name', user.firstName, {
      sameSite: 'Lax',
      maxAge: 2 * 60 * 60 * 1000
    });

    res.json({ success: true });

  } catch (err) {
    console.error('[LOGIN ERROR]:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

export const logout = (req, res) => {
  res.clearCookie('iscan_token');
  res.clearCookie('iscan_email');
  res.clearCookie('iscan_name');
  res.json({ success: true });
};
