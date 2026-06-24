import FlowerLiquidityPool from "../../models/flowerLiquidityPool.js";

export async function getPool(currency) {
  const pool = await FlowerLiquidityPool.findOne({ currency });

  if (!pool) {
    throw new Error(`${currency} pool not found`);
  }

  return pool;
}

export async function getPoolStatus() {
  const [flower, usdt] = await Promise.all([
    FlowerLiquidityPool.findOne({ currency: "FLOWER" }),
    FlowerLiquidityPool.findOne({ currency: "USDT" }),
  ]);

  return {
    FLOWER: {
      balance: flower?.balance || 0,
      reserved: flower?.reserved || 0,
      available:
        (flower?.balance || 0) -
        (flower?.reserved || 0),
    },

    USDT: {
      balance: usdt?.balance || 0,
      reserved: usdt?.reserved || 0,
      available:
        (usdt?.balance || 0) -
        (usdt?.reserved || 0),
    },
  };
}
