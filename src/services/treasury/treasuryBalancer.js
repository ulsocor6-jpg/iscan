import PhpLiquidityPool from "../../models/phpLiquidityPool.js";
import blockchainInspector from "../blockchain/inspector/blockchainInspector.js";

const CHECK_INTERVAL_MS = 60 * 1000;

const LEVELS = {
  CRITICAL: 0.10,
  WARNING: 0.25,
};

export function getPoolHealth(pool) {
  const available = pool.balance - pool.reserved;
  const usable = available - pool.minThreshold;
  const ratio = pool.balance > 0 ? available / pool.balance : 0;

  let status;

  if (usable <= 0) status = "DEADLOCK";
  else if (ratio < LEVELS.CRITICAL) status = "CRITICAL";
  else if (ratio < LEVELS.WARNING) status = "WARNING";
  else status = "HEALTHY";

  return {
    currency: pool.currency,
    balance: pool.balance,
    reserved: pool.reserved,
    available,
    usable: Math.max(0, usable),
    minThreshold: pool.minThreshold,
    ratio: +(ratio * 100).toFixed(1),
    status,
  };
}

async function checkPools() {
  try {
    const pools = await PhpLiquidityPool.find();
    const results = pools.map(getPoolHealth);

    for (const r of results) {

      const metadata = {
        subsystem: "treasury",

        currency: r.currency,

        status: r.status,

        balance: r.balance,

        reserved: r.reserved,

        available: r.available,

        usable: r.usable,

        minThreshold: r.minThreshold,

        ratio: r.ratio,

        autoRecoverable: false
      };

      switch (r.status) {

        case "DEADLOCK":

          blockchainInspector.error(
            "treasury",
            `${r.currency} treasury deadlock`,
            metadata
          );

          console.error(
            `[TREASURY] ⛔ DEADLOCK — ${r.currency}: usable=0, inject funds immediately`
          );

          break;

        case "CRITICAL":

          blockchainInspector.error(
            "treasury",
            `${r.currency} treasury critically low`,
            metadata
          );

          console.error(
            `[TREASURY] 🔴 CRITICAL — ${r.currency}: ${r.ratio}% available, usable=${r.usable.toFixed(2)}`
          );

          break;

        case "WARNING":

          blockchainInspector.warn(
            "treasury",
            `${r.currency} treasury running low`,
            metadata
          );

          console.warn(
            `[TREASURY] 🟡 WARNING — ${r.currency}: ${r.ratio}% available`
          );

          break;

        case "HEALTHY":

        default:

          blockchainInspector.success(
            "treasury",
            `${r.currency} treasury healthy`,
            metadata
          );

          console.log(
            `[TREASURY] ✅ ${r.currency}: ${r.ratio}% available (${r.usable.toFixed(2)} usable)`
          );

      }

    }

    return results;

  } catch (err) {

    blockchainInspector.error(
      "treasury",
      "Treasury health check failed",
      {
        subsystem: "treasury",
        error: err.message,
        autoRecoverable: true
      }
    );

    console.error("[TREASURY] check failed:", err.message);

  }
}

let _interval = null;

export function startTreasuryBalancer() {

  if (_interval) return;

  console.log(
    "[TREASURY] balancer started — checking every 60s"
  );

  blockchainInspector.info(
    "treasury",
    "Treasury balancer started",
    {
      interval: CHECK_INTERVAL_MS
    }
  );

  checkPools();

  _interval = setInterval(checkPools, CHECK_INTERVAL_MS);

}

export async function getPoolStatus() {
  const pools = await PhpLiquidityPool.find();
  return pools.map(getPoolHealth);
}
