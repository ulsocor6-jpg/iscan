import express from 'express';
import authMiddleware from '../auth/middleware/authMiddleware.js';
import { sendActionOtp, verifyActionOtp } from '../controllers/verificationController.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/otp/send', sendActionOtp);
router.post('/otp/verify', verifyActionOtp);

export default router;
