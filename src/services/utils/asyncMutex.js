// src/services/utils/asyncMutex.js
//
// Minimal per-key mutex for serializing access to a shared resource within
// a single Node process (e.g. one treasury wallet's on-chain balance).
// Not safe across multiple server instances/replicas — if ISCAN ever runs
// more than one process touching the same treasury wallet, this needs to
// become a DB-backed lock (e.g. atomic findOneAndUpdate on a lock doc)
// instead. Single-instance only, by design, for now.
//
// Why this exists: FLOWER swap orders share one treasury wallet balance
// per chain. Without serialization, two orders' processSwap() calls can
// both pass their own "treasury has enough FLOWER" check against the same
// balance, then race to spend it — the loser fails with a misleading
// "Treasury FLOWER balance X < Y" error even though ITS OWN swept tokens
// genuinely arrived. Locking by chain key (e.g. "flower:BASE") forces one
// order's full check+approve+swap sequence to finish before the next
// order's check even runs, so the balance seen is always accurate for the
// order currently executing.

const chains = new Map(); // key -> Promise (tail of the queue for that key)

/**
 * Run `fn` exclusively for the given `key`. If another call for the same
 * key is in flight, this one waits its turn — FIFO by call order.
 *
 * @param {string} key
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>} whatever fn resolves to
 */
export function withLock(key, fn) {
  const tail = chains.get(key) || Promise.resolve();

  let release;
  const settled = new Promise((resolve) => { release = resolve; });
  chains.set(key, tail.then(() => settled).catch(() => settled));

  return tail
    .catch(() => {})
    .then(() => fn())
    .finally(() => release());
}

export function activeLockCount() {
  return chains.size;
}
