import PhpLiquidityPool from '../../models/phpLiquidityPool.js';

const CHECK_INTERVAL_MS = 60 * 1000;

const LEVELS = {
  CRITICAL: 0.10,
  WARNING:  0.25,
};

export function getPoolHealth(pool) {
  const available = pool.balance - pool.reserved;
  const usable    = available - pool.minThreshold;
  const ratio     = pool.balance > 0 ? available / pool.balance : 0;

  let status;
  if (usable <= 0)                  status = "DEADLOCK";
  else if (ratio < LEVELS.CRITICAL) status = "CRITICAL";
  else if (ratio < LEVELS.WARNING)  status = "WARNING";
  else                              status = "HEALTHY";

  return {
    currency:     pool.currency,
    balance:      pool.balance,
    reserved:     pool.reserved,
    available,
    usable:       Math.max(0, usable),
    minThreshold: pool.minThreshold,
    ratio:        +(ratio * 100).toFixed(1),
    status,
  };
}

async function checkPools() {
  try {
    const pools   = await PhpLiquidityPool.find();
    const results = pools.map(getPoolHealth);
    for (const r of results) {
      if (r.status === "DEADLOCK") {
        console.error(`[TREASURY] ⛔ DEADLOCK — ${r.currency}: usable=0, inject funds immediately`);
      } else if (r.status === "CRITICAL") {
        console.error(`[TREASURY] 🔴 CRITICAL — ${r.currency}: ${r.ratio}% available, usable=${r.usable.toFixed(2)}`);
      } else if (r.status === "WARNING") {
        console.warn(`[TREASURY] 🟡 WARNING — ${r.currency}: ${r.ratio}% available`);
      } else {
        console.log(`[TREASURY] ✅ ${r.currency}: ${r.ratio}% available (${r.usable.toFixed(2)} usable)`);
      }
    }
    return results;
  } catch (err) {
    console.error("[TREASURY] check failed:", err.message);
  }
}

let _interval = null;

export function startTreasuryBalancer() {
  if (_interval) return;
  console.log("[TREASURY] balancer started — checking every 60s");
  checkPools();
  _interval = setInterval(checkPools, CHECK_INTERVAL_MS);
}

export async function getPoolStatus() {
  const pools = await PhpLiquidityPool.find();
  return pools.map(getPoolHealth);
}
