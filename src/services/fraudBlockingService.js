import fraudAIService from './fraudAIService.js';

class FraudBlockingService {

  /**
   * HARD GATE BEFORE TRANSACTION EXECUTION
   */
  async evaluate({ userId, amount }) {

    const result = await fraudAIService.analyze(userId, amount);

    // HARD BLOCK
    if (result.risk === 'HIGH') {
      return {
        allowed: false,
        reason: 'HIGH_RISK',
        score: result.score
      };
    }

    // SOFT REVIEW
    if (result.risk === 'MEDIUM') {
      return {
        allowed: false,
        reason: 'REVIEW_REQUIRED',
        score: result.score
      };
    }

    return {
      allowed: true,
      score: result.score
    };
  }
}

export default new FraudBlockingService();
