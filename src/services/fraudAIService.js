import Transaction from '../models/transactionModel.js';

class FraudAIService {

  /**
   * ADVANCED RISK SCORING ENGINE
   */
  async analyze(userId, amount) {

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const tx = await Transaction.find({
      senderId: userId,
      createdAt: { $gte: last24h }
    });

    let score = 0;

    // 1. velocity check
    if (tx.length > 15) score += 40;

    // 2. total volume anomaly
    const volume = tx.reduce((a, t) => a + t.amount, 0);
    if (volume > 100000) score += 30;

    // 3. sudden spike detection
    const avg = volume / (tx.length || 1);
    if (amount > avg * 5 && avg > 0) score += 25;

    // 4. high-risk amount
    if (amount > 50000) score += 20;

    let risk = 'LOW';
    if (score >= 70) risk = 'HIGH';
    else if (score >= 40) risk = 'MEDIUM';

    return {
      risk,
      score,
      txCount: tx.length,
      volume
    };
  }
}

export default new FraudAIService();
