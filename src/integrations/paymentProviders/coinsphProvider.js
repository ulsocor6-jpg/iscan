import BasePaymentProvider from './baseProvider.js';

class CoinsPHProvider extends BasePaymentProvider {

  async sendMoney({ amount, address }) {
    return {
      success: true,
      provider: 'coinsph',
      referenceId: 'COINS-' + Date.now(),
      amount,
      address
    };
  }

  async getStatus(referenceId) {
    return {
      status: 'completed',
      referenceId
    };
  }
}

export default new CoinsPHProvider();
