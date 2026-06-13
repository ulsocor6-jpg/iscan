import { getRate } from "./rateProvider.js";

export async function convertToPHP(amount, currency) {
  if (currency === "PHP") {
    return {
      phpAmount: amount,
      rate: 1,
      source: "local"
    };
  }

  const rate = await getRate(currency);

  if (!rate) {
    throw new Error(`FX rate not available for ${currency}`);
  }

  const phpAmount = parseFloat((amount * rate).toFixed(2));

  return {
    phpAmount,
    rate,
    source: "coingecko"
  };
}
