import maya from '../integrations/paymentProviders/mayaProvider.js';
import coinsph from '../integrations/paymentProviders/coinsphProvider.js';

class SettlementService {

  async route(payment) {

    switch (payment.method) {

      case 'maya':
        return await maya.sendMoney(payment);

      case 'coinsph':
        return await coinsph.sendMoney(payment);

      default:
        throw new Error('Unsupported provider');
    }
  }
}

export default new SettlementService();
