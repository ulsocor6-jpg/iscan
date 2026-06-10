// Coins.ph Integration — stub ready for live API keys
// Apply at: https://coins.ph/

const COINSPH_API = 'https://api.coins.ph/v3';
const API_KEY = process.env.COINSPH_API_KEY || null;

export const sendToCoinsph = async ({ amount, currency, recipientPhone, referenceId }) => {
  if (!API_KEY) {
    // Return mock response until API key is ready
    return {
      success: true,
      mock: true,
      message: 'Coins.ph API key not yet configured. Settlement queued.',
      referenceId,
      amount,
      currency
    };
  }

  // Live implementation — uncomment when API key is ready
  // const res = await fetch(`${COINSPH_API}/sellorder`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ amount, currency, phone: recipientPhone })
  // });
  // return await res.json();
};

export const getLiveRate = async (currency = 'USDC') => {
  try {
    const coinMap = {
      USDC: 'usd-coin',
      ETH: 'ethereum',
      MATIC: 'matic-network',
      RON: 'ronin'
    };
    const coinId = coinMap[currency] || 'usd-coin';
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=php`);
    const data = await res.json();
    return data[coinId]?.php || null;
  } catch (err) {
    console.error('[RATE FETCH ERROR]:', err.message);
    return null;
  }
};
