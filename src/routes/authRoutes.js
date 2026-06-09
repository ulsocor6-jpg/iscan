import express from 'express';

import {
  register,
  login,
  logout,
  verifyEmail,
  verify
} from '../controllers/authController.js';

import User from '../models/userModel.js';

import { requireAuth } from '../../middleware/authMiddleware.js';

const router = express.Router();

/* =========================
   AUTH CORE ROUTES
========================= */

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/verify-email', verifyEmail);
router.get('/me', requireAuth, verify);

/* =========================
   DEV ONLY: FORCE VERIFY
   (REMOVE IN PRODUCTION)
========================= */

router.get('/force-verify', async (req, res) => {
  try {
    const user = await User.findOne({ email: 'test@example.com' });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.isVerified = true;
    user.verificationToken = null;

    await user.save();

    return res.json({
      success: true,
      message: 'User force verified successfully',
      user: {
        id: user._id,
        email: user.email,
        isVerified: user.isVerified
      }
    });

  } catch (err) {
    console.error('[FORCE VERIFY ERROR]:', err);

    return res.status(500).json({
      success: false,
      message: 'Force verify failed'
    });
  }
});

export default router;
