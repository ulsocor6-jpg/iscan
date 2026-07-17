import express from 'express';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { selfServiceRateLimiter } from '../../../middleware/rateLimiters.js';
import { runForUserHandler } from '../../controllers/reconciliation/reconciliationController.js';

const router = express.Router();

router.post('/me/run', requireAuth, selfServiceRateLimiter, async (req, res, next) => {
  // Force target to the caller's own account — never trust a client-supplied id
  req.params.userId = req.user.id;

  // Intercept res.json so we can reshape the admin-style payload into a
  // plain, honest status before it reaches the user. We never expose
  // riskLevel, proposalId, currency-level breakdowns, or policy reasons —
  // just whether their balance was actually updated, is pending review,
  // or was already correct.
  const originalJson = res.json.bind(res);
  res.json = (payload) => {
    if (!payload?.success) {
      return originalJson({ success: false, message: 'Unable to update balance right now.' });
    }

    const outcomes = payload?.data?.outcomes || [];
    const anyApplied = outcomes.some((o) => o.applied === true);
    const anyQueued = outcomes.some((o) => o.queued === true);

    if (anyApplied) {
      return originalJson({ success: true, message: 'Balance updated.' });
    }
    if (anyQueued) {
      return originalJson({
        success: true,
        message: "We're reviewing your balance. This may take a little time."
      });
    }
    // Neither applied nor queued — balance was already correct (NO_DRIFT)
    return originalJson({ success: true, message: 'Your balance is already up to date.' });
  };

  try {
    await runForUserHandler(req, res, next);
  } catch (err) {
    next(err);
  }
});

export default router;
