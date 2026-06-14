import liquidityScoringModel from './liquidityScoringModel.js';
import executionQualityEngine from './executionQualityEngine.js';
import treasuryRebalancer from './treasuryRebalancer.js';

/**
 * Institutional Smart Order Router (SOR)
 */
class SmartOrderRouter {
  async route({ fromAsset, toAsset, amount, user }) {
    // 1. Get all available venues
    const venues = await liquidityScoringModel.getVenues({
      fromAsset,
      toAsset,
      amount
    });

    // 2. Score venues (not just price—risk included)
    const scored = venues.map(v => ({
      ...v,
      score: this.calculateInstitutionalScore(v)
    }));

    // 3. Sort by institutional score
    const best = scored.sort((a, b) => b.score - a.score)[0];

    // 4. Pre-trade risk check
    await treasuryRebalancer.validateExposure({
      asset: fromAsset,
      amount
    });

    // 5. Execute with execution engine
    return executionQualityEngine.execute({
      venue: best,
      user,
      amount
    });
  }

  calculateInstitutionalScore(v) {
    return (
      v.priceImpact * -1 +
      v.liquidityDepth * 0.4 +
      v.latencyScore * -0.2 +
      v.fee * -0.3 +
      v.slippageRisk * -0.5
    );
  }
}

export default new SmartOrderRouter();
