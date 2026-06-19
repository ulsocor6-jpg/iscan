/**
 * kycMiddleware.js
 * ─────────────────────────────────────────────────────────────
 * Attaches kycTier to req.user and gates transactions by tier.
 *
 * Usage:
 *   import { attachKyc, requireKyc } from '../middleware/kycMiddleware.js';
 *
 *   // Just attach tier (no blocking):
 *   router.get('/profile', requireAuth, attachKyc, handler);
 *
 *   // Block if below a tier:
 *   router.post('/cashout', requireAuth, requireKyc('partial'), handler);
 *
 *   // Gate by daily transaction limit:
 *   router.post('/swap', requireAuth, kycLimitGuard(amount), handler);
 */

import User        from '../models/userModel.js';
import Transaction from '../models/transactionModel.js';

// Daily limits per tier (PHP)
export const KYC_LIMITS = {
  unverified: 2_000,
  partial:    20_000,
  full:       Infinity,
};

// ── 1. Attach kycTier to req.user (non-blocking) ──────────────────────────
export async function attachKyc(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('kycTier').lean();
    req.user.kycTier = user?.kycTier || 'unverified';
    next();
  } catch {
    req.user.kycTier = 'unverified';
    next();
  }
}

// ── 2. Block if user is below required tier ────────────────────────────────
export function requireKyc(minTier = 'partial') {
  const TIER_RANK = { unverified: 0, partial: 1, full: 2 };
  return async (req, res, next) => {
    if (!req.user.kycTier) {
      const user = await User.findById(req.user.id).select('kycTier').lean();
      req.user.kycTier = user?.kycTier || 'unverified';
    }
    const userRank     = TIER_RANK[req.user.kycTier]     ?? 0;
    const requiredRank = TIER_RANK[minTier] ?? 1;

    if (userRank < requiredRank) {
      return res.status(403).json({
        success: false,
        code:    'KYC_REQUIRED',
        message: `This action requires ${minTier} verification.`,
        currentTier: req.user.kycTier,
        requiredTier: minTier,
      });
    }
    next();
  };
}

// ── 3. Daily limit guard ───────────────────────────────────────────────────
// Pass amount in PHP. Call after attachKyc.
export function kycLimitGuard(getAmount) {
  return async (req, res, next) => {
    try {
      if (!req.user.kycTier) {
        const user = await User.findById(req.user.id).select('kycTier').lean();
        req.user.kycTier = user?.kycTier || 'unverified';
      }

      const limit = KYC_LIMITS[req.user.kycTier];
      if (limit === Infinity) return next();  // full tier — no cap

      // Get requested amount (can be a function or pulled from req.body)
      const amount = typeof getAmount === 'function'
        ? getAmount(req)
        : parseFloat(req.body?.amount || req.body?.phpAmount || 0);

      if (amount > limit) {
        return res.status(403).json({
          success: false,
          code:    'KYC_LIMIT_EXCEEDED',
          message: `Your ${req.user.kycTier} account allows a maximum of ₱${limit.toLocaleString()} per transaction. Please upgrade your verification.`,
          currentTier: req.user.kycTier,
          limit,
        });
      }

      // Check daily total from transactions today
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const dailyTotal = await Transaction.aggregate([
        {
          $match: {
            senderId:  req.user.id,
            createdAt: { $gte: startOfDay },
            status:    { $in: ['pending', 'settled', 'completed'] },
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const usedToday = dailyTotal[0]?.total || 0;

      if (usedToday + amount > limit) {
        return res.status(403).json({
          success: false,
          code:    'KYC_DAILY_LIMIT_EXCEEDED',
          message: `Daily limit of ₱${limit.toLocaleString()} reached. Used: ₱${usedToday.toLocaleString()}. Upgrade your verification for higher limits.`,
          currentTier: req.user.kycTier,
          limit,
          usedToday,
          remaining: Math.max(0, limit - usedToday),
        });
      }

      next();
    } catch (err) {
      console.error('[kycLimitGuard]', err.message);
      next();  // fail open — don't block on middleware error
    }
  };
}
