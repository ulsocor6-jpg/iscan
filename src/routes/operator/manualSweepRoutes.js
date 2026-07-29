import express from 'express';
import { requireAuth, requireAdmin } from '../../auth/middleware/authMiddleware.js';
import { getSweepCandidates } from '../../services/treasury/manualSweepCandidateService.js';
import { sweepStablecoinToTreasury } from '../../services/treasury/stablecoinSweepService.js';

const router = express.Router();

router.get('/candidates', requireAuth, requireAdmin, async (req, res) => {
  try {
    const minNetValueUSD = req.query.minNetValueUSD != null
      ? parseFloat(req.query.minNetValueUSD)
      : 2;

    if (Number.isNaN(minNetValueUSD) || minNetValueUSD < 0) {
      return res.status(400).json({ success: false, message: 'Invalid minNetValueUSD' });
    }

    const candidates = await getSweepCandidates({ minNetValueUSD });
    res.json({ success: true, count: candidates.length, candidates });
  } catch (err) {
    console.error('[ManualSweep] candidates failed:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/execute', requireAuth, requireAdmin, async (req, res) => {
  const { targets } = req.body;
  if (!Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ success: false, message: 'targets array required' });
  }

  const results = [];

  for (const t of targets) {
    const { walletIndex, chain, token } = t;
    if (walletIndex == null || !chain || !token) {
      results.push({ ...t, success: false, error: 'Missing walletIndex/chain/token' });
      continue;
    }

    try {
      const result = await sweepStablecoinToTreasury({ chain, token, walletIndex });
      results.push({ walletIndex, chain, token, success: true, ...result });
    } catch (err) {
      console.error(
        `[ManualSweep] Failed for walletIndex=${walletIndex} chain=${chain} token=${token}:`,
        err.message
      );
      results.push({ walletIndex, chain, token, success: false, error: err.message });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  res.json({
    success: true,
    succeeded,
    failed: results.length - succeeded,
    results,
  });
});

export default router;
