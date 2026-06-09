import BasePaymentProvider from './baseProvider.js';

class MayaProvider extends BasePaymentProvider {

  async sendMoney({ amount, account }) {
    return {
      success: true,
      provider: 'maya',
      referenceId: 'MAYA-' + Date.now(),
      amount,
      account
    };
  }

  async getStatus(referenceId) {
    return {
      status: 'completed',
      referenceId
    };
  }
}

export default new MayaProvider();
