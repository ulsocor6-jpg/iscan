import axios from 'axios';
import BaseProvider from './baseProvider.js';

class TransakProvider extends BaseProvider {
  constructor() {
    super();
    this.apiKey = process.env.TRANSAK_API_KEY;
    this.secret = process.env.TRANSAK_SECRET;
    this.baseUrl = process.env.TRANSAK_ENV === 'prod' 
      ? 'https://api.transak.com' 
      : 'https://staging-api.transak.com';
  }

  async createOrder({ userId, walletAddress, fiatAmount, network = 'polygon' }) {
    const referenceId = `ISCAN-${userId}-${Date.now()}`;
    
    const res = await axios.post(`${this.baseUrl}/api/v2/order`, {
      partnerOrderId: referenceId,
      walletAddress,
      fiatAmount,
      fiatCurrency: 'PHP',
      cryptoCurrency: 'USDC',
      network,
      paymentMethod: 'gcash',
      redirectURL: `${process.env.APP_URL}/dashboard?order=${referenceId}`
    }, {
      headers: { 'api-key': this.apiKey }
    });

    return {
      orderId: res.data.data.id,
      paymentUrl: res.data.data.paymentUrl,
      referenceId
    };
  }

  verifyWebhookSignature(payload, signature) {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', this.secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return hmac === signature;
  }
}

export default new TransakProvider();
