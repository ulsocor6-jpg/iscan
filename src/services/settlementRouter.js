import crypto from 'crypto';

/**
 * ISCAN SETTLEMENT ROUTER
 * Decides how money moves across rails
 */

export function buildSettlementPlan({
  fromCurrency,
  toCurrency,
  method,
  amount
}) {
  const referenceId =
    'SETTLE-' + crypto.randomBytes(6).toString('hex').toUpperCase();

  // DEFAULT: internal ledger transfer
  if (method === 'internal') {
    return {
      type: 'internal_transfer',
      referenceId,
      requiresExternalProvider: false
    };
  }

  // CRYPTO → FIAT (e.g. USDC → PHP)
  if (fromCurrency === 'USDC' && toCurrency === 'PHP') {
    return {
      type: 'crypto_to_fiat',
      provider: method, // coinsph, manual, paymongo
      referenceId,
      requiresExternalProvider: true
    };
  }

  // FIAT → CRYPTO
  if (fromCurrency === 'PHP' && toCurrency === 'USDC') {
    return {
      type: 'fiat_to_crypto',
      provider: method,
      referenceId,
      requiresExternalProvider: true
    };
  }

  // CRYPTO → CRYPTO
  if (fromCurrency === 'USDC' && toCurrency === 'USDC') {
    return {
      type: 'crypto_to_crypto',
      referenceId,
      requiresExternalProvider: false
    };
  }

  // DEFAULT FALLBACK
  return {
    type: 'manual_review',
    referenceId,
    requiresExternalProvider: true
  };
}
