import crypto from 'crypto';
import User from '../models/userModel.js';
import IdentityProfile from '../models/IdentityProfile.js';

const DIDIT_BASE = 'https://verification.didit.me/v3';

export const createVerificationSession = async (req, res) => {
  try {
    const userId = req.user.id;

    const response = await fetch(`${DIDIT_BASE}/session/`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.DIDIT_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: process.env.DIDIT_WORKFLOW_ID,
        callback: `${process.env.APP_URL}/kyc/complete`,
        vendor_data: userId,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[DIDIT] session create failed:', errText);
      return res.status(502).json({ success: false, message: 'Verification provider error' });
    }

    const session = await response.json();

    await IdentityProfile.findOneAndUpdate(
      { userId },
      { userId, kycStatus: 'pending', diditSessionId: session.session_id },
      { upsert: true, new: true }
    );

    res.json({ success: true, verificationUrl: session.url, sessionId: session.session_id });
  } catch (err) {
    console.error('[DIDIT createSession]', err);
    res.status(500).json({ success: false, message: 'Failed to start verification' });
  }
};

function verifyWebhookSignature(rawBody, signatureV2, timestamp, secret) {
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const parsed = JSON.parse(rawBody);
  const canonical = JSON.stringify(parsed, Object.keys(parsed).sort());
  const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureV2));
  } catch {
    return false;
  }
}

function resolveTier(decision) {
  const idVerified = decision.id_verifications?.some(v => v.status === 'Approved');
  const faceMatched = decision.face_matches?.some(f => f.status === 'Approved');
  const livenessPassed = decision.liveness_checks?.some(l => l.status === 'Approved');

  if (idVerified && faceMatched && livenessPassed) {
    const docType = decision.id_verifications.find(v => v.status === 'Approved')?.document_type;
    return { tier: 'full', docType };
  }
  if (idVerified) {
    return { tier: 'partial', docType: decision.id_verifications.find(v => v.status === 'Approved')?.document_type };
  }
  return { tier: 'unverified', docType: null };
}

export const handleDiditWebhook = async (req, res) => {
  try {
    const signature = req.get('X-Signature-V2');
    const timestamp = req.get('X-Timestamp');
    const rawBody = req.body.toString('utf8');

    if (!verifyWebhookSignature(rawBody, signature, timestamp, process.env.DIDIT_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody);
    const { session_id, status, vendor_data, decision } = payload;
    const userId = vendor_data;

    console.log(`[DIDIT WEBHOOK] session=${session_id} status=${status} user=${userId}`);

    if (status === 'Approved' && decision) {
      const { tier, docType } = resolveTier(decision);
      await User.findByIdAndUpdate(userId, { kycTier: tier });
      await IdentityProfile.findOneAndUpdate(
        { userId },
        {
          kycStatus: 'verified',
          faceVerified: decision.face_matches?.some(f => f.status === 'Approved') || false,
          qualifiesFor: tier === 'full' ? 'full' : 'partial',
          idType: docType || undefined,
          reviewedAt: new Date(),
        }
      );
      console.log(`[DIDIT] user=${userId} auto-verified -> tier=${tier}`);
    } else if (status === 'Declined') {
      await IdentityProfile.findOneAndUpdate(
        { userId },
        { kycStatus: 'rejected', rejectionReason: 'Automated verification declined', reviewedAt: new Date() }
      );
    } else if (status === 'In Review') {
      await IdentityProfile.findOneAndUpdate({ userId }, { kycStatus: 'under_review' });
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[DIDIT WEBHOOK ERROR]', err);
    res.status(200).json({ received: true, error: 'processing_failed' });
  }
};

export const getSessionDecision = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const response = await fetch(`${DIDIT_BASE}/session/${sessionId}/decision/`, {
      headers: { 'x-api-key': process.env.DIDIT_API_KEY },
    });
    const data = await response.json();
    res.json({ success: true, data });
  } catch (err) {
    console.error('[DIDIT getDecision]', err);
    res.status(500).json({ success: false, message: 'Failed to fetch decision' });
  }
};
