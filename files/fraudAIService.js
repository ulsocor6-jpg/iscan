const Transaction = require('../models/transactionModel.js');

/**
 * FRAUD AI SERVICE — LAYER 2
 * 24h velocity + volume + spike + high-value scoring
 */
class FraudAIService {
  async analyze(userId, amount) {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const tx = await Transaction.find({
      senderId: userId,
      createdAt: { $gte: last24h }
    });

    let score = 0;

    // 1. Velocity check
    if (tx.length > 15) score += 40;

    // 2. Total volume anomaly
    const volume = tx.reduce((a, t) => a + t.amount, 0);
    if (volume > 100000) score += 30;

    // 3. Sudden spike detection
    const avg = volume / (tx.length || 1);
    if (amount > avg * 5 && avg > 0) score += 25;

    // 4. High-risk single amount
    if (amount > 50000) score += 20;

    let risk = 'LOW';
    if (score >= 70) risk = 'HIGH';
    else if (score >= 40) risk = 'MEDIUM';

    return { risk, score, txCount: tx.length, volume };
  }
}

module.exports = new FraudAIService();
