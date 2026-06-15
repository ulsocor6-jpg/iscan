const Transaction = require('../models/transactionModel.js');

/**
 * FRAUD DETECTION ENGINE — LAYER 1
 * Fast check: last 1h velocity + basic rules
 */
class FraudService {
  async evaluateTransaction({ senderId, amount }) {
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const recentTx = await Transaction.find({
      senderId,
      createdAt: { $gte: lastHour }
    });

    let riskScore = 0;

    // RULE 1: Too many transactions in last hour
    if (recentTx.length > 10) riskScore += 40;

    // RULE 2: Amount is a spike vs recent average
    const avg = recentTx.reduce((a, t) => a + t.amount, 0) / (recentTx.length || 1);
    if (amount > avg * 3 && avg > 0) riskScore += 30;

    // RULE 3: High-value single transfer
    if (amount > 50000) riskScore += 20;

    return {
      riskScore,
      block: riskScore >= 70,
      review: riskScore >= 40 && riskScore < 70
    };
  }
}

module.exports = new FraudService();
