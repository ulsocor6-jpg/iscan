class BasePaymentProvider {

  async sendMoney(data) {
    throw new Error('sendMoney() not implemented');
  }

  async getStatus(referenceId) {
    throw new Error('getStatus() not implemented');
  }
}

export default BasePaymentProvider;
