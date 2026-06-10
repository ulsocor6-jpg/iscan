
import crypto from 'crypto';

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY;
const base64Auth = Buffer.from(PAYMONGO_SECRET + ':').toString('base64');

const pmFetch = async (path, options = {}) => {
  const res = await fetch('https://api.paymongo.com/v1' + path, {
    ...options,
    headers: {
      'Authorization': 'Basic ' + base64Auth,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return res.json();
};

/**
 * Create a PayMongo payment link for cash-in
 * Returns { checkoutUrl, linkId, referenceId }
 */
export const createCashInLink = async ({ userId, amount, description }) => {
  const referenceId = 'CASHIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();

  const data = await pmFetch('/links', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        attributes: {
          amount: Math.round(amount * 100), // PayMongo uses centavos
          description: description || 'ISCAN Cash In',
          remarks: userId.toString() + '|' + referenceId
        }
      }
    })
  });

  if (data.errors) throw new Error(data.errors[0].detail);

  return {
    checkoutUrl: data.data.attributes.checkout_url,
    linkId: data.data.id,
    referenceId
  };
};

/**
 * Verify PayMongo webhook signature
 */
export const verifyWebhookSignature = (rawBody, sigHeader, secret) => {
  const parts = sigHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
  const signature = parts.find(p => p.startsWith('te=')).split('=')[1];
  const toSign = timestamp + '.' + rawBody;
  const expected = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
  return expected === signature;
};
