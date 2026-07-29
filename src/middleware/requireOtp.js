import { shouldRequireOtp } from '../services/withdrawalRiskEngine.js';
import { consumeVerificationToken } from '../services/actionVerificationService.js';
import User from '../models/userModel.js';

export async function requireOtpIfNeeded(req, res, next) {
    try {
        const user = await User.findById(req.user.id);
        const amount = parseFloat(req.body.amount);
        if (isNaN(amount)) return res.status(400).json({ error: 'Invalid amount' });

        const needsOtp = await shouldRequireOtp(user, amount, req);
        if (!needsOtp) return next();

        // Action fingerprint MUST match exactly what was passed to verifyOtp
        // when the token was issued, so a token minted for one amount can't
        // be replayed against a different one.
        const actionParams = { amount };

        const otpToken = req.body.otpToken;
        const verified = await consumeVerificationToken(
            user._id,
            'WITHDRAWAL',
            otpToken,
            actionParams
        );

        if (!verified) {
            return res.status(403).json({ requireOtp: true, message: 'OTP verification required' });
        }

        return next();
    } catch (err) {
        console.error('[OtpMiddleware]', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
