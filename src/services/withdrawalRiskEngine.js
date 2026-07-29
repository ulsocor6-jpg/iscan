import advancedFraudService from './advancedFraudService.js';

export async function shouldRequireOtp(user, withdrawalAmount, req) {
    // 1. Only ACTIVE accounts can skip OTP (optional)
    if (user.accountStatus !== 'ACTIVE') return true;

    // 2. Large amount threshold
    const threshold = parseFloat(process.env.WITHDRAWAL_OTP_THRESHOLD || '50000');
    if (withdrawalAmount > threshold) return true;

    // 3. New IP / device check (stub – you can store lastKnownIP later)
    const clientIP = req.ip || req.connection?.remoteAddress;
    if (clientIP && user.lastKnownIP && clientIP !== user.lastKnownIP) {
        return true;
    }

    // 4. Leverage existing fraud checks
    try {
        const aiScore = await advancedFraudService.evaluate({
            userId: user._id,
            amount: withdrawalAmount,
            action: 'withdrawal'
        });
        if (aiScore.risk === 'HIGH' || aiScore.risk === 'MEDIUM') return true;
    } catch (e) {
        console.warn('[RiskEngine] Fraud check failed – forcing OTP:', e.message);
        return true; // fail‑safe
    }

    return false;
}
