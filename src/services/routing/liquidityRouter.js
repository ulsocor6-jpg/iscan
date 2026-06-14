import routeEvaluator from './routeEvaluator.js';
import executionEngine from './executionEngine.js';

/**
 * Main Liquidity Router
 * Decides best execution path
 */
class LiquidityRouter {
  async routeSwap({ fromAsset, toAsset, amount, user }) {
    // 1. Evaluate all possible routes
    const routes = await routeEvaluator.evaluate({
      fromAsset,
      toAsset,
      amount
    });

    if (!routes.length) {
      throw new Error('No liquidity routes available');
    }

    // 2. Pick best route
    const bestRoute = routes.sort((a, b) => b.score - a.score)[0];

    // 3. Execute
    const result = await executionEngine.execute({
      route: bestRoute,
      user,
      amount
    });

    return {
      route: bestRoute,
      result
    };
  }
}

export default new LiquidityRouter();
