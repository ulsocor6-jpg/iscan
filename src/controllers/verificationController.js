import { sendOtp, verifyOtp } from '../services/actionVerificationService.js';

export async function sendActionOtp(req, res) {
    try {
        const { purpose } = req.body;
        if (!purpose) return res.status(400).json({ error: 'purpose is required' });

        await sendOtp(req.user.id, purpose);
        return res.status(200).json({ sent: true });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
}

export async function verifyActionOtp(req, res) {
    try {
        const { code, purpose, actionParams } = req.body;
        if (!code || !purpose) {
            return res.status(400).json({ error: 'code and purpose are required' });
        }

        // actionParams must match what the follow-up request (e.g. the
        // withdrawal call) will send, or the token won't be accepted there.
        // For WITHDRAWAL this is typically { amount }.
        const token = await verifyOtp(req.user.id, code, purpose, actionParams || {});

        // Client stores this and sends it back as otpToken on the
        // actual withdrawal request.
        return res.status(200).json({ verified: true, otpToken: token });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
}
