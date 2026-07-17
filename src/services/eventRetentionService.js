// src/services/eventRetentionService.js
//
// Prunes high-volume, low-value entries from the `events` collection —
// blockchain polling/pipeline logs — on a rolling basis. Unlike the TTL
// index approach, a plain query has no operator restrictions, so a regex
// prefix match (which partial TTL indexes can't express) works fine here.
//
// Deliberately NEVER touches: withdrawal.*, admin.*, auth.* — those are
// the real transaction/compliance trail and stay indefinitely. Only
// http_request (covered separately by a TTL index) and blockchain.* noise
// get cleaned here.

import mongoose from "mongoose";

const RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // keep 3 days of blockchain logs
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // run once an hour

let sweeping = false;

async function pruneOldEvents() {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const db = mongoose.connection.db;

  const result = await db.collection("events").deleteMany({
    type: { $regex: "^blockchain\\." },
    timestamp: { $lt: cutoff },
  });

  if (result.deletedCount > 0) {
    console.log(`[eventRetentionService] Pruned ${result.deletedCount} old blockchain.* events.`);
  }
}

function start() {
  setInterval(() => {
    if (sweeping) return;
    sweeping = true;
    pruneOldEvents()
      .catch(err => console.error("[eventRetentionService]", err.message))
      .finally(() => { sweeping = false; });
  }, SWEEP_INTERVAL_MS);

  console.log("[eventRetentionService] Started — pruning blockchain.* events older than 3 days, hourly.");
}

export default { start, pruneOldEvents };
