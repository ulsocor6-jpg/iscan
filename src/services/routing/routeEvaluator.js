import axios from 'axios';
import priceAggregator from './priceAggregator.js';

/**
 * Evaluates all liquidity sources
 */
class RouteEvaluator {
  async evaluate({ fromAsset, toAsset, amount }) {
    const routes = [];

    // 1. DEX ROUTE (1inch)
    const dexQuote = await this.get1inchQuote(fromAsset, toAsset, amount);
    if (dexQuote) {
      routes.push({
        type: 'DEX_1INCH',
        provider: '1inch',
        output: dexQuote.toAmount,
        gasEstimate: dexQuote.gas,
        fee: dexQuote.fee,
        score: this.score(dexQuote)
      });
    }

    // 2. INTERNAL TREASURY ROUTE
    routes.push({
      type: 'TREASURY',
      provider: 'internal',
      output: amount * 0.999, // simulate spread
      gasEstimate: 0,
      fee: 0.001,
      score: 0.85
    });

    // 3. PRICE VALIDATION (anti-bad-route check)
    const referencePrice = await priceAggregator.getReferencePrice(fromAsset, toAsset);

    return routes.filter(r => this.validate(r, referencePrice));
  }

  async get1inchQuote(from, to, amount) {
    try {
      const res = await axios.get(
        `https://api.1inch.dev/swap/v5.2/1/quote`,
        {
          params: {
            src: from,
            dst: to,
            amount
          },
          headers: {
            Authorization: `Bearer ${process.env.ONEINCH_API_KEY}`
          }
        }
      );

      return {
        toAmount: res.data.toTokenAmount,
        gas: res.data.estimatedGas,
        fee: 0.003
      };
    } catch {
      return null;
    }
  }

  score(route) {
    // simple routing heuristic
    return (
      Number(route.toAmount || 0) -
      Number(route.gas || 0) * 0.00001 -
      Number(route.fee || 0)
    );
  }

  validate(route, referencePrice) {
    // prevent extreme slippage exploitation
    const deviation = Math.abs(route.toAmount - referencePrice) / referencePrice;
    return deviation < 0.05; // 5% max slippage tolerance
  }
}

export default new RouteEvaluator();
