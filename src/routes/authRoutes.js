import express from 'express';
import {
  register,
  login,
  logout,
  verify,
  verifyEmail,
  forgotPassword,
  resetPassword,
  resendVerification,
  exitImpersonation
} from '../controllers/authController.js';
import { requireAuth } from '../auth/middleware/authMiddleware.js';
import { loginLimiter, authActionLimiter } from '../../middleware/rateLimiters.js';

import {
    getSessions,
    getCurrentSession,
    revokeSession,
    revokeAllSessions
} from "../auth/controllers/sessionController.js";

const router = express.Router();

router.use((req,res,next)=>{
  console.log("[AUTH ROUTE HIT]", req.method, req.originalUrl);
  next();
});


router.post('/register', authActionLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/logout', logout);

/*
|--------------------------------------------------------------------------
| Session Management
|--------------------------------------------------------------------------
*/

router.get('/sessions', requireAuth, getSessions);
router.get('/sessions/me', requireAuth, getCurrentSession);

router.delete('/sessions', requireAuth, revokeAllSessions);

router.delete('/sessions/:sessionId', requireAuth, revokeSession);

router.get('/verify', requireAuth, verify);
router.get('/me', requireAuth, verify);  // alias — dashboard calls both
router.get('/verify-email', verifyEmail);
router.post('/forgot-password', authActionLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/resend-verification', authActionLimiter, resendVerification);
router.post('/exit-impersonation', requireAuth, exitImpersonation);

export default router;
