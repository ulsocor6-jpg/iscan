// src/services/treasury/treasurySendQueue.js
//
// Serializes every on-chain send from a treasury wallet, per chain, so
// two concurrent operations (a sweep, a withdrawal payout, a stablecoin
// credit) never call getTransactionCount() before the previous send has
// actually been mined. Without this, two sends racing for "next nonce"
// can collide — one gets dropped or replaces the other outright.
//
// Scope: serializes within THIS process only. If this backend is ever
// run as multiple replicas/instances, this needs to move to an external
// lock (e.g. Redis) — an in-memory queue here would not see sends
// happening in a sibling process.

const queues = new Map(); // chainKey -> Promise chain

/**
 * Runs `fn` only after every previously queued send for this chainKey has
 * settled (succeeded or failed) — guaranteeing at most one in-flight
 * treasury send per chain at any time.
 *
 * @param {string} chainKey - e.g. "BASE", "RONIN"
 * @param {() => Promise<any>} fn - the actual send logic to run exclusively
 */
export function withTreasuryLock(chainKey, fn) {
  const key = (chainKey || "").toUpperCase();
  const prev = queues.get(key) || Promise.resolve();

  // Run fn only after prev settles, regardless of whether prev
  // succeeded or failed — one bad send must not permanently jam the
  // queue for this chain.
  const result = prev.then(fn, fn);

  // Store a version of this chain's tail that never rejects, so the
  // NEXT call's `.then(fn, fn)` above always fires — rejections are
  // still delivered to whoever awaited `result` directly.
  queues.set(key, result.then(() => {}, () => {}));

  return result;
}

export default { withTreasuryLock };
