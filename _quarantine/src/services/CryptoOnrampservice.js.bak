/**
 * cryptoOnrampService.js
 * USDC / USDT → PHP conversion service
 * Routes payout via Maya (wallet) or GCash (via PayMongo)
 *
 * Place at: src/services/cryptoOnrampService.js
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import Ledger from '../models/ledgerModel.js';
import { WalletService } from './walletService.js';

// ─── RATE FETCHER ────────────────────────────────────────────────────────────
// Uses CoinGecko free API (no key needed). Falls back to a hardcoded floor.

const RATE_CACHE = { rate: null, fetchedAt: 0 };
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getLiveUsdPhpRate() {
  const now = Date.now();
  if (RATE_CACHE.rate && now - RATE_CACHE.fetchedAt < CACHE_TTL_MS) {
    return RATE_CACHE.rate;
  }

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=php',
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const rate = data?.['usd-coin']?.php;
    if (rate && rate > 0) {
      RATE_CACHE.rate = rate;
      RATE_CACHE.fetchedAt = now;
      return rate;
    }
  } catch (err) {
    console.warn('[ONRAMP] CoinGecko fetch failed, using fallback rate:', err.message);
  }

  // Hardcoded fallback (update periodically)
  return 59.0;
}

// ─── FEE CONFIG ──────────────────────────────────────────────────────────────

const FEES = {
  maya:  { pct: 0.015, label: '1.5%' }, // 1.5% Maya transfer fee
  gcash: { pct: 0.020, label: '2.0%' }, // 2.0% GCash via PayMongo
};

export function calculateConversion({ usdAmount, phpRate, channel }) {
  const fee     = FEES[channel] || FEES.maya;
  const gross   = usdAmount * phpRate;
  const feePHP  = gross * fee.pct;
  const net     = gross - feePHP;

  return {
    usdAmount,
    phpRate,
    grossPHP: parseFloat(gross.toFixed(2)),
    feePHP:   parseFloat(feePHP.toFixed(2)),
    feePct:   fee.label,
    netPHP:   parseFloat(net.toFixed(2)),
    channel,
  };
}

// ─── MAYA PAYOUT ─────────────────────────────────────────────────────────────

async function payoutViaMaya({ amount, mobileNumber, referenceId }) {
  // Maya Disbursement API  (sandbox → production: change base URL in .env)
  const base = process.env.MAYA_BASE_URL || 'https://pg-sandbox.paymaya.com';
  const key  = process.env.MAYA_SECRET_KEY || '';

  const body = {
    totalAmount: { value: amount, currency: 'PHP' },
    recipient: {
      name: mobileNumber,
      contact: { phone: mobileNumber },
    },
    requestReferenceNumber: referenceId,
  };

  const res = await fetch(`${base}/disbursements/v1/single`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Maya payout failed: ${data?.message || res.status}`);
  return { provider: 'maya', providerRef: data.referenceNumber || referenceId, raw: data };
}

// ─── GCASH PAYOUT (via PayMongo) ─────────────────────────────────────────────

async function payoutViaGcash({ amount, mobileNumber, referenceId }) {
  const key = process.env.PAYMONGO_SECRET_KEY || '';

  // Step 1: create payment intent
  const piRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: Math.round(amount * 100), // centavos
          payment_method_allowed: ['gcash'],
          currency: 'PHP',
          description: `ISCAN USDC/USDT cashout ${referenceId}`,
        },
      },
    }),
  });

  const piData = await piRes.json();
  if (!piRes.ok) throw new Error(`GCash intent failed: ${piData?.errors?.[0]?.detail || piRes.status}`);

  const intentId = piData.data.id;
  const clientKey = piData.data.attributes.client_key;

  // Step 2: attach GCash payment method
  const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          type: 'gcash',
          billing: { phone: mobileNumber },
        },
      },
    }),
  });

  const pmData = await pmRes.json();
  if (!pmRes.ok) throw new Error(`GCash PM failed: ${pmData?.errors?.[0]?.detail || pmRes.status}`);

  const pmId = pmData.data.id;

  // Step 3: attach payment method to intent
  const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}/attach`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          payment_method: pmId,
          client_key: clientKey,
          return_url: `${process.env.APP_URL}/dashboard?cashout=done`,
        },
      },
    }),
  });

  const attachData = await attachRes.json();
  const redirectUrl = attachData?.data?.attributes?.next_action?.redirect?.url;

  return {
    provider: 'gcash',
    providerRef: intentId,
    redirectUrl,  // Frontend should open this for GCash OTP
    raw: attachData,
  };
}

// ─── MAIN CONVERSION FUNCTION ─────────────────────────────────────────────────

export async function convertCryptoToPhp({
  userId,
  token,           // 'USDC' | 'USDT'
  usdAmount,
  channel,         // 'maya' | 'gcash'
  mobileNumber,    // recipient phone
  txHash,          // on-chain tx hash (proof of deposit)
}) {
  // 1. Validate
  if (!['USDC', 'USDT'].includes(token))  throw new Error('Only USDC and USDT are supported');
  if (!['maya', 'gcash'].includes(channel)) throw new Error('Channel must be maya or gcash');
  if (usdAmount < 1)                        throw new Error('Minimum conversion is $1 USD');
  if (usdAmount > 10_000)                   throw new Error('Maximum single conversion is $10,000 USD');
  if (!mobileNumber)                        throw new Error('Mobile number is required for payout');
  if (!txHash)                              throw new Error('On-chain transaction hash required');

  // 2. Get live rate & calculate
  const phpRate  = await getLiveUsdPhpRate();
  const quote    = calculateConversion({ usdAmount, phpRate, channel });
  const ref      = 'ONRAMP-' + crypto.randomBytes(6).toString('hex').toUpperCase();

  // 3. Write PENDING ledger entry (crypto received)
  await WalletService.credit({
    userId,
    amount:          quote.netPHP,
    currency:        'PHP',
    description:     `${token} → PHP via ${channel.toUpperCase()} | Rate: ₱${phpRate}/USD | Ref: ${ref}`,
    referenceId:     ref,
    transactionType: 'crypto_onramp',
    status:          'pending',
  });

  // 4. Trigger payout
  let payoutResult;
  try {
    if (channel === 'maya') {
      payoutResult = await payoutViaMaya({ amount: quote.netPHP, mobileNumber, referenceId: ref });
    } else {
      payoutResult = await payoutViaGcash({ amount: quote.netPHP, mobileNumber, referenceId: ref });
    }
  } catch (payoutErr) {
    // Reverse the pending ledger entry on payout failure
    await Ledger.findOneAndUpdate(
      { referenceId: ref },
      { status: 'failed', failureReason: payoutErr.message }
    );
    throw payoutErr;
  }

  // 5. Mark ledger as completed
  await Ledger.findOneAndUpdate(
    { referenceId: ref },
    { status: 'completed', providerRef: payoutResult.providerRef }
  );

  await WalletService.syncBalance(userId);

  return {
    success:      true,
    referenceId:  ref,
    token,
    usdAmount,
    phpRate,
    grossPHP:     quote.grossPHP,
    feePHP:       quote.feePHP,
    netPHP:       quote.netPHP,
    channel,
    mobileNumber,
    txHash,
    providerRef:  payoutResult.providerRef,
    redirectUrl:  payoutResult.redirectUrl || null, // GCash only
    status:       'completed',
  };
}
