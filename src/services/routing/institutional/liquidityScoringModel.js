import axios from 'axios';

class LiquidityScoringModel {
  async getVenues({ fromAsset, toAsset, amount }) {
    const venues = [];

    // 1. 1inch
    try {
      const oneInch = await axios.get('https://api.1inch.dev/swap/v5.2/1/quote', {
        params: { src: fromAsset, dst: toAsset, amount },
        headers: {
          Authorization: `Bearer ${process.env.ONEINCH_API_KEY}`
        }
      });

      venues.push({
        type: 'DEX_1INCH',
        provider: '1inch',
        priceImpact: 0.02,
        liquidityDepth: 0.9,
        latencyScore: 0.8,
        fee: 0.003,
        slippageRisk: 0.04,
        output: oneInch.data.toTokenAmount
      });
    } catch {}

    // 2. Treasury fallback
    venues.push({
      type: 'TREASURY',
      provider: 'internal',
      priceImpact: 0.01,
      liquidityDepth: 0.6,
      latencyScore: 1.0,
      fee: 0.001,
      slippageRisk: 0.02,
      output: amount * 0.999
    });

    return venues;
  }
}

export default new LiquidityScoringModel();
