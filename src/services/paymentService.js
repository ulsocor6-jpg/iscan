import crypto from 'crypto';

const pmFetch = async (path, options = {}) => {
  const secret = process.env.PAYMONGO_SECRET_KEY;
  const base64Auth = Buffer.from(secret + ':').toString('base64');
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

export const createCashInLink = async ({ userId, amount, description }) => {
  const referenceId = 'CASHIN-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  const data = await pmFetch('/links', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        attributes: {
          amount: Math.round(amount * 100),
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

export const verifyWebhookSignature = (rawBody, sigHeader, secret) => {
  const parts = sigHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
  const signature = parts.find(p => p.startsWith('te=')).split('=')[1];
  const toSign = timestamp + '.' + rawBody;
  const expected = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
  return expected === signature;
};
