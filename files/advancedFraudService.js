const Transaction = require('../models/transactionModel.js');

/**
 * ADVANCED FRAUD SERVICE — LAYER 3
 * All-time behavioral analysis: variance + avg spend patterns
 */
class AdvancedFraudService {
  async analyzeUserBehavior(userId) {
    const tx = await Transaction.find({ senderId: userId });

    if (tx.length < 5) {
      return { risk: 'LOW', score: 10 };
    }

    const amounts = tx.map(t => t.amount);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / amounts.length;

    let score = 0;

    // Erratic spending pattern
    if (variance > avg * 2) score += 40;

    // High average transaction value
    if (avg > 10000) score += 20;

    // Very high transaction count (potential mule account)
    if (tx.length > 50) score += 10;

    let risk = 'LOW';
    if (score > 70) risk = 'HIGH';
    else if (score > 40) risk = 'MEDIUM';

    return { risk, score, avg, variance };
  }
}

module.exports = new AdvancedFraudService();
