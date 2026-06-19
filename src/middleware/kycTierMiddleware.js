import User from '../models/userModel.js';

export const requireFullKYC = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const user = await User.findById(req.user.id).select('kycTier').lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.kycTier !== 'full') {
      return res.status(403).json({
        success: false,
        message: 'Internal transfers require full verification (primary government ID + selfie). Please complete KYC to unlock this feature.',
        kycTier: user.kycTier,
        requiredTier: 'full',
      });
    }

    req.user.kycTier = user.kycTier;
    next();
  } catch (err) {
    console.error('[KYC TIER MIDDLEWARE ERROR]', err);
    return res.status(500).json({ success: false, message: 'Verification check failed' });
  }
};

export default requireFullKYC;
