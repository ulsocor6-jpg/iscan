import Transaction from '../models/transactionModel.js';

class AdvancedFraudService {

  async analyzeUserBehavior(userId) {

    const tx = await Transaction.find({ senderId: userId });

    if (tx.length < 5) {
      return { risk: 'LOW', score: 10 };
    }

    const amounts = tx.map(t => t.amount);
    const avg = amounts.reduce((a,b) => a + b, 0) / amounts.length;

    const variance = amounts.reduce((a,b) => a + Math.pow(b - avg, 2), 0) / amounts.length;

    let score = 0;

    if (variance > avg * 2) score += 40;
    if (avg > 10000) score += 20;
    if (tx.length > 50) score += 10;

    let risk = 'LOW';
    if (score > 70) risk = 'HIGH';
    else if (score > 40) risk = 'MEDIUM';

    return {
      risk,
      score,
      avg,
      variance
    };
  }
}

export default new AdvancedFraudService();
