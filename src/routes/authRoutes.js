import express from 'express';
import {
  register,
  login,
  logout,
  verify,
  verifyEmail,
  forgotPassword,
  resetPassword
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/verify', requireAuth, verify);
router.get('/me', requireAuth, verify);  // alias — dashboard calls both
router.get('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
