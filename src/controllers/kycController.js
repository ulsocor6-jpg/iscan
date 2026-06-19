/**
 * kycController.js  (UPDATED)
 * ─────────────────────────────────────────────────────────────
 * Handles KYC submissions and admin approval.
 *
 * Flow:
 *  1. User submits ID photo + selfie via uploadID / uploadSelfie
 *  2. Profile saved as 'pending' / 'under_review'
 *  3. Admin approves → user.kycTier updated to 'partial' or 'full'
 */

import IdentityProfile from '../models/IdentityProfile.js';
import User            from '../models/userModel.js';

// Secondary IDs → partial tier
const SECONDARY_IDS = [
  'school id', 'postal id', 'philhealth', 'phil health',
  'barangay id', 'company id', 'voter id', 'prc id',
];

// Primary IDs → full tier
const PRIMARY_IDS = [
  'passport', 'sss', 'umid', 'driver', "driver's license",
  'philsys', 'national id', 'pagibig', 'pag-ibig',
];

function classifyId(idType = '') {
  const lower = idType.toLowerCase();
  if (PRIMARY_IDS.some(p => lower.includes(p)))   return { category: 'primary',   tier: 'full' };
  if (SECONDARY_IDS.some(s => lower.includes(s))) return { category: 'secondary', tier: 'partial' };
  return { category: 'secondary', tier: 'partial' };  // default to secondary
}

// ── Submit ID ──────────────────────────────────────────────────────────────
export const uploadID = async (req, res) => {
  try {
    const { idType, idNumber, firstName, middleName, lastName, birthDate, nationality } = req.body;
    const idImageUrl = req.file?.path || req.body.idImageUrl || null;

    if (!idType) return res.status(400).json({ error: 'idType is required' });

    const { category, tier } = classifyId(idType);

    let profile = await IdentityProfile.findOne({ userId: req.user.id });

    if (profile) {
      // Update existing
      Object.assign(profile, {
        idType, idNumber, idImageUrl, idCategory: category, qualifiesFor: tier,
        firstName:   firstName   || profile.firstName,
        middleName:  middleName  || profile.middleName,
        lastName:    lastName    || profile.lastName,
        birthDate:   birthDate   || profile.birthDate,
        nationality: nationality || profile.nationality,
        kycStatus:   'pending',
        faceVerified: false,
      });
    } else {
      profile = new IdentityProfile({
        userId: req.user.id,
        idType, idNumber, idImageUrl,
        idCategory: category, qualifiesFor: tier,
        firstName, middleName, lastName, birthDate, nationality,
        kycStatus: 'pending',
      });
    }

    await profile.save();

    res.json({
      success: true,
      message: 'ID submitted. Please upload your selfie holding the ID.',
      idCategory: category,
      qualifiesFor: tier,
      profile,
    });
  } catch (err) {
    console.error('[KYC uploadID]', err);
    res.status(500).json({ error: 'ID upload failed' });
  }
};

// ── Submit Selfie ──────────────────────────────────────────────────────────
export const uploadSelfie = async (req, res) => {
  try {
    const selfieImageUrl = req.file?.path || req.body.selfieImageUrl || null;

    const profile = await IdentityProfile.findOne({ userId: req.user.id });
    if (!profile) return res.status(404).json({ error: 'Submit your ID first' });
    if (!profile.idImageUrl) return res.status(400).json({ error: 'ID photo missing' });

    profile.selfieImageUrl = selfieImageUrl;
    profile.kycStatus      = 'under_review';
    await profile.save();

    res.json({
      success: true,
      message: 'Selfie submitted. Your verification is under review.',
      kycStatus: 'under_review',
    });
  } catch (err) {
    console.error('[KYC uploadSelfie]', err);
    res.status(500).json({ error: 'Selfie upload failed' });
  }
};

// ── Get KYC Status ─────────────────────────────────────────────────────────
export const getKYCStatus = async (req, res) => {
  try {
    const [profile, user] = await Promise.all([
      IdentityProfile.findOne({ userId: req.user.id }).lean(),
      User.findById(req.user.id).select('kycTier').lean(),
    ]);

    res.json({
      success:     true,
      kycTier:     user?.kycTier || 'unverified',
      profile:     profile || null,
    });
  } catch (err) {
    console.error('[KYC getStatus]', err);
    res.status(500).json({ error: 'Unable to fetch KYC status' });
  }
};

// ── Admin: Approve KYC ────────────────────────────────────────────────────
export const adminApproveKYC = async (req, res) => {
  try {
    const { userId, tier } = req.body;   // tier: 'partial' | 'full'
    if (!['partial', 'full'].includes(tier))
      return res.status(400).json({ error: 'tier must be partial or full' });

    const profile = await IdentityProfile.findOne({ userId });
    if (!profile) return res.status(404).json({ error: 'KYC profile not found' });

    profile.kycStatus   = 'verified';
    profile.faceVerified = true;
    profile.reviewedAt  = new Date();
    profile.reviewedBy  = req.user.id;
    await profile.save();

    await User.findByIdAndUpdate(userId, { kycTier: tier });

    console.log(`[KYC] Admin approved userId=${userId} → tier=${tier}`);
    res.json({ success: true, userId, kycTier: tier });
  } catch (err) {
    console.error('[KYC adminApprove]', err);
    res.status(500).json({ error: 'Approval failed' });
  }
};

// ── Admin: Reject KYC ────────────────────────────────────────────────────
export const adminRejectKYC = async (req, res) => {
  try {
    const { userId, reason } = req.body;

    const profile = await IdentityProfile.findOne({ userId });
    if (!profile) return res.status(404).json({ error: 'KYC profile not found' });

    profile.kycStatus        = 'rejected';
    profile.rejectionReason  = reason || 'Documents unclear or invalid';
    profile.reviewedAt       = new Date();
    profile.reviewedBy       = req.user.id;
    await profile.save();

    console.log(`[KYC] Admin rejected userId=${userId}: ${reason}`);
    res.json({ success: true, userId, kycStatus: 'rejected' });
  } catch (err) {
    console.error('[KYC adminReject]', err);
    res.status(500).json({ error: 'Rejection failed' });
  }
};

// ── Admin: List Pending KYC ───────────────────────────────────────────────
export const adminListPendingKYC = async (req, res) => {
  try {
    const pending = await IdentityProfile
      .find({ kycStatus: { $in: ['pending', 'under_review'] } })
      .populate('userId', 'firstName lastName email kycTier')
      .sort({ createdAt: 1 })
      .lean();

    res.json({ success: true, count: pending.length, pending });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load pending KYC' });
  }
};
