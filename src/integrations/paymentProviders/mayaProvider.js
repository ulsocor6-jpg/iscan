import BasePaymentProvider from './baseProvider.js';

class MayaProvider extends BasePaymentProvider {

  async sendMoney({ amount, account, referenceId }) {
    // simulate failure rate (important for testing)
    const success = Math.random() > 0.05; // 95% success rate

    if (!success) {
      return {
        success: false,
        error: "Maya network error",
        referenceId
      };
    }

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
