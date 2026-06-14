import axios from 'axios';

class PriceAggregator {
  async getReferencePrice(from, to) {
    try {
      const res = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price`,
        {
          params: {
            ids: from,
            vs_currencies: to
          }
        }
      );

      return res.data?.[from]?.[to] || 0;
    } catch {
      return 0;
    }
  }
}

export default new PriceAggregator();
