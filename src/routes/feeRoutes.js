import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import FeeRecord from '../models/feeModel.js';
const router = express.Router();
router.get('/my', requireAuth, async (req, res) => {
  try {
    const fees = await FeeRecord.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100);
    res.json({ fees });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
export default router;
