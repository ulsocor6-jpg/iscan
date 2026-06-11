import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import User from '../models/userModel.js';

const router = express.Router();

/**
 * GET /api/v1/users/search?q=<name or phone or email>
 * Used by P2P send form to look up recipient by identifier.
 * Returns minimal profile — never exposes password/hash.
 *
 * Example: /api/v1/users/search?q=juan
 */
router.get('/search', requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();

    if (!q || q.length < 2) {
      return res.status(400).json({ success: false, error: 'Query too short (min 2 chars)' });
    }

    // Search by name, email, or phone — adjust fields to match your userModel
    const users = await User.find({
      _id: { $ne: req.user.id }, // exclude self
      $or: [
        { name:  { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } }
      ]
    })
    .select('_id name email phone') // only safe fields
    .limit(10);

    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/users/me
 * Convenience alias — same as /auth/me but from user context
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -__v');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
