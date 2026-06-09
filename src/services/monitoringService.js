import Transaction from '../models/transactionModel.js';

class MonitoringService {

  async getSystemStats() {

    const total = await Transaction.countDocuments();
    const failed = await Transaction.countDocuments({ status: 'failed' });
    const success = await Transaction.countDocuments({ status: 'settled' });

    return {
      totalTransactions: total,
      successRate: total ? (success / total) * 100 : 0,
      failureRate: total ? (failed / total) * 100 : 0
    };
  }

  async getRiskSnapshot() {

    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const recent = await Transaction.find({
      createdAt: { $gte: lastHour }
    });

    const volume = recent.reduce((a, t) => a + t.amount, 0);

    return {
      lastHourTransactions: recent.length,
      volume,
      average: recent.length ? volume / recent.length : 0
    };
  }
}

export default new MonitoringService();
