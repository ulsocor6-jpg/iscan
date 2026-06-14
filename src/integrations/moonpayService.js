import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * MoonPay Integration Service
 * Handles transaction creation + signature verification helpers
 */
class MoonPayService {
  constructor() {
    this.apiKey = process.env.MOONPAY_API_KEY;
    this.apiSecret = process.env.MOONPAY_API_SECRET;
    this.baseUrl = process.env.MOONPAY_BASE_URL || 'https://api.moonpay.com';

    if (!this.apiKey || !this.apiSecret) {
      console.warn('[MoonPay] Missing API credentials');
    }
  }

  /**
   * Generate signed query string (MoonPay requirement for secure requests)
   */
  signParams(params) {
    const queryString = new URLSearchParams(params).toString();
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('base64');

    return `${queryString}&signature=${encodeURIComponent(signature)}`;
  }

  /**
   * Create MoonPay BUY URL (fiat -> crypto)
   * User is redirected here
   */
  createBuyUrl({
    walletAddress,
    currencyCode = 'usdt',
    baseCurrencyAmount,
    baseCurrencyCode = 'php',
    email,
    externalTransactionId,
    redirectURL
  }) {
    if (!walletAddress) throw new Error('walletAddress required');

    const params = {
      apiKey: this.apiKey,
      currencyCode,
      baseCurrencyAmount,
      baseCurrencyCode,
      walletAddress,
      email,
      externalTransactionId,
      redirectURL
    };

    const signedQuery = this.signParams(params);

    return `${this.baseUrl}/buy?${signedQuery}`;
  }

  /**
   * Create SELL flow (crypto -> fiat)
   */
  createSellUrl({
    walletAddress,
    cryptoCurrencyCode = 'usdt',
    baseCurrencyCode = 'php',
    cryptoAmount,
    email,
    externalTransactionId,
    redirectURL
  }) {
    const params = {
      apiKey: this.apiKey,
      walletAddress,
      currencyCode: cryptoCurrencyCode,
      baseCurrencyCode,
      cryptoAmount,
      email,
      externalTransactionId,
      redirectURL
    };

    const signedQuery = this.signParams(params);

    return `${this.baseUrl}/sell?${signedQuery}`;
  }

  /**
   * Verify webhook signature from MoonPay
   */
  verifyWebhook(rawBody, signature) {
    const computed = crypto
      .createHmac('sha256', this.apiSecret)
      .update(rawBody)
      .digest('base64');

    return computed === signature;
  }

  /**
   * Fetch transaction status (optional polling fallback)
   */
  async getTransaction(transactionId) {
    const res = await axios.get(
      `${this.baseUrl}/v1/transactions/${transactionId}`,
      {
        headers: {
          Authorization: `Api-Key ${this.apiKey}`
        }
      }
    );

    return res.data;
  }
}

export default new MoonPayService();
