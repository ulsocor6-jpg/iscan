import crypto from 'crypto';
import Ledger from '../models/ledgerModel.js';
import WalletService from './walletService.js';

const RATE_CACHE = { rate: null, fetchedAt: 0 };
const CACHE_TTL_MS = 60_000;

export async function getLiveUsdPhpRate() {
  const now = Date.now();
  if (RATE_CACHE.rate && now - RATE_CACHE.fetchedAt < CACHE_TTL_MS) return RATE_CACHE.rate;
  try {
    const res  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=php', { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const rate = data?.['usd-coin']?.php;
    if (rate && rate > 0) { RATE_CACHE.rate = rate; RATE_CACHE.fetchedAt = now; return rate; }
  } catch (err) {
    console.warn('[ONRAMP] CoinGecko fetch failed, using fallback rate:', err.message);
  }
  return 59.0;
}

const FEES = { maya: { pct: 0.015, label: '1.5%' }, gcash: { pct: 0.020, label: '2.0%' } };

export function calculateConversion({ usdAmount, phpRate, channel }) {
  const fee    = FEES[channel] || FEES.maya;
  const gross  = usdAmount * phpRate;
  const feePHP = gross * fee.pct;
  const net    = gross - feePHP;
  return {
    usdAmount, phpRate,
    grossPHP: parseFloat(gross.toFixed(2)),
    feePHP:   parseFloat(feePHP.toFixed(2)),
    feePct:   fee.label,
    netPHP:   parseFloat(net.toFixed(2)),
    channel,
  };
}

async function payoutViaMaya({ amount, mobileNumber, referenceId }) {
  const base = process.env.MAYA_BASE_URL   || 'https://pg-sandbox.paymaya.com';
  const key  = process.env.MAYA_SECRET_KEY || '';
  const res  = await fetch(`${base}/disbursements/v1/single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64') },
    body: JSON.stringify({ totalAmount: { value: amount, currency: 'PHP' }, recipient: { name: mobileNumber, contact: { phone: mobileNumber } }, requestReferenceNumber: referenceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Maya payout failed: ${data?.message || res.status}`);
  return { provider: 'maya', providerRef: data.referenceNumber || referenceId, raw: data };
}

async function payoutViaGcash({ amount, mobileNumber, referenceId }) {
  const key   = process.env.PAYMONGO_SECRET_KEY || '';
  const auth  = 'Basic ' + Buffer.from(key + ':').toString('base64');
  const piRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ data: { attributes: { amount: Math.round(amount * 100), payment_method_allowed: ['gcash'], currency: 'PHP', description: `ISCAN USDC/USDT cashout ${referenceId}` } } }),
  });
  const piData = await piRes.json();
  if (!piRes.ok) throw new Error(`GCash intent failed: ${piData?.errors?.[0]?.detail || piRes.status}`);
  const intentId  = piData.data.id;
  const clientKey = piData.data.attributes.client_key;
  const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ data: { attributes: { type: 'gcash', billing: { phone: mobileNumber } } } }),
  });
  const pmData = await pmRes.json();
  if (!pmRes.ok) throw new Error(`GCash PM failed: ${pmData?.errors?.[0]?.detail || pmRes.status}`);
  const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}/attach`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ data: { attributes: { payment_method: pmData.data.id, client_key: clientKey, return_url: `${process.env.APP_URL}/dashboard?cashout=done` } } }),
  });
  const attachData  = await attachRes.json();
  const redirectUrl = attachData?.data?.attributes?.next_action?.redirect?.url;
  return { provider: 'gcash', providerRef: intentId, redirectUrl, raw: attachData };
}

export async function convertCryptoToPhp({ userId, token, usdAmount, channel, mobileNumber, txHash }) {
  if (!['USDC', 'USDT'].includes(token))    throw new Error('Only USDC and USDT are supported');
  if (!['maya', 'gcash'].includes(channel)) throw new Error('Channel must be maya or gcash');
  if (usdAmount < 1)                        throw new Error('Minimum conversion is $1 USD');
  if (usdAmount > 10_000)                   throw new Error('Maximum single conversion is $10,000 USD');
  if (!mobileNumber)                        throw new Error('Mobile number is required for payout');

  const phpRate = await getLiveUsdPhpRate();
  const quote   = calculateConversion({ usdAmount, phpRate, channel });
  const ref     = 'ONRAMP-' + crypto.randomBytes(6).toString('hex').toUpperCase();

  await WalletService.credit({
    userId, amount: quote.netPHP, currency: 'PHP',
    description: `${token} → PHP via ${channel.toUpperCase()} | Rate: ₱${phpRate}/USD | Ref: ${ref}`,
    referenceId: ref, transactionType: 'crypto_onramp', status: 'pending',
  });

  let payoutResult;
  try {
    payoutResult = channel === 'maya'
      ? await payoutViaMaya({ amount: quote.netPHP, mobileNumber, referenceId: ref })
      : await payoutViaGcash({ amount: quote.netPHP, mobileNumber, referenceId: ref });
  } catch (payoutErr) {
    await Ledger.findOneAndUpdate({ referenceId: ref }, { status: 'failed', failureReason: payoutErr.message });
    throw payoutErr;
  }

  await Ledger.findOneAndUpdate({ referenceId: ref }, { status: 'completed', providerRef: payoutResult.providerRef });
  await WalletService.syncBalance(userId);

  return {
    success: true, referenceId: ref, token, usdAmount, phpRate,
    grossPHP: quote.grossPHP, feePHP: quote.feePHP, netPHP: quote.netPHP,
    channel, mobileNumber, txHash: txHash || null,
    providerRef: payoutResult.providerRef, redirectUrl: payoutResult.redirectUrl || null,
    status: 'completed',
  };
}
