import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import User from '../models/userModel.js';

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
   LOGIN (FIXED)
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

    // Cookie (browser auth)
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

    // API response (for frontend + curl)
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
   VERIFY TOKEN (MIDDLE LAYER TEST)
========================= */
export const verify = async (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
};
