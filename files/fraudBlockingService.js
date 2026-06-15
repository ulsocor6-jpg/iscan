const fraudAIService = require('./fraudAIService.js');
const advancedFraudService = require('./advancedFraudService.js');

/**
 * FRAUD BLOCKING SERVICE — HARD GATE
 * Runs Layer 2 (AI/24h) + Layer 3 (behavioral) in parallel.
 * Returns a single allow/block/review decision.
 *
 * Layer 1 (fraudService) runs separately in transferOrchestrator
 * before this is called, so we don't double-query the 1h window.
 */
class FraudBlockingService {
  async evaluate({ userId, amount }) {
    const [aiResult, behaviorResult] = await Promise.all([
      fraudAIService.analyze(userId, amount),
      advancedFraudService.analyzeUserBehavior(userId)
    ]);

    // Either layer returning HIGH = hard block
    if (aiResult.risk === 'HIGH' || behaviorResult.risk === 'HIGH') {
      return {
        allowed: false,
        reason: 'HIGH_RISK',
        aiScore: aiResult.score,
        behaviorScore: behaviorResult.score
      };
    }

    // Either layer returning MEDIUM = hold for review
    if (aiResult.risk === 'MEDIUM' || behaviorResult.risk === 'MEDIUM') {
      return {
        allowed: false,
        reason: 'REVIEW_REQUIRED',
        aiScore: aiResult.score,
        behaviorScore: behaviorResult.score
      };
    }

    return {
      allowed: true,
      aiScore: aiResult.score,
      behaviorScore: behaviorResult.score
    };
  }
}

module.exports = new FraudBlockingService();
