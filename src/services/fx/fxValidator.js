export function validateFxRequest({
  amount,
  currency
}) {
  if (!amount || Number(amount) <= 0) {
    throw new Error("Invalid FX amount");
  }

  if (!currency) {
    throw new Error("Currency required");
  }

  const allowedCurrencies = [
    "PHP",
    "USDC",
    "USDT",
    "ETH",
    "BTC",
    "MATIC",
    "RON"
  ];

  if (
    !allowedCurrencies.includes(
      currency.toUpperCase()
    )
  ) {
    throw new Error(
      `Unsupported currency: ${currency}`
    );
  }

  return true;
}

export function validateRate(rate) {
  if (
    rate === null ||
    rate === undefined ||
    Number(rate) <= 0
  ) {
    throw new Error("Invalid FX rate");
  }

  return true;
}
