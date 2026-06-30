import express from 'express';
import {
  register,
  login,
  logout,
  verify,
  verifyEmail,
  forgotPassword,
  resetPassword,
  resendVerification
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use((req,res,next)=>{
  console.log("[AUTH ROUTE HIT]", req.method, req.originalUrl);
  next();
});


router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/verify', requireAuth, verify);
router.get('/me', requireAuth, verify);  // alias — dashboard calls both
router.get('/verify-email', verifyEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/resend-verification', resendVerification);

export default router;
