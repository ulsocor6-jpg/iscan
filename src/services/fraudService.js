import Transaction from '../models/transactionModel.js';

/**
 * FRAUD DETECTION ENGINE (ISCAN RISK LAYER)
 */
class FraudService {

  /**
   * CHECK TRANSFER RISK BEFORE EXECUTION
   */
  async checkTransferRisk({ senderId, amount }) {

    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const recentTx = await Transaction.find({
      senderId,
      createdAt: { $gte: lastHour }
    });

    let riskScore = 0;

    // RULE 1: Too many transactions
    if (recentTx.length > 10) {
      riskScore += 40;
    }

    // RULE 2: Large amount anomaly
    const avg = recentTx.reduce((a, t) => a + t.amount, 0) / (recentTx.length || 1);

    if (amount > avg * 3 && avg > 0) {
      riskScore += 30;
    }

    // RULE 3: High-value single transfer
    if (amount > 50000) {
      riskScore += 20;
    }

    // FINAL CLASSIFICATION
    let decision = 'ALLOW';

    if (riskScore >= 70) decision = 'BLOCK';
    else if (riskScore >= 40) decision = 'REVIEW';

    return {
      riskScore,
      decision
    };
  }
}

export default new FraudService();
