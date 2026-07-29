// src/services/compliance/OperationCorrelator.js
import brainBus from "../../brainbus/brainBus.js";
import { Channels } from "../../brainbus/channels.js";

// In-memory storage: address -> array of transaction events
const addressWindows = new Map();
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

let lastCleanup = 0;
function cleanupWindows() {
  const now = Date.now();
  if (now - lastCleanup < 120_000) return; // at most every 2 minutes
  lastCleanup = now;
  for (const [addr, events] of addressWindows.entries()) {
    const recent = events.filter(e => now - e.timestamp < WINDOW_MS);
    if (recent.length === 0) {
      addressWindows.delete(addr);
    } else {
      addressWindows.set(addr, recent);
    }
  }
}

function correlateAndEmit(addr) {
  const events = addressWindows.get(addr);
  if (!events || events.length < 2) return; // need at least 2 txs to correlate

  const incoming = events.filter(e => e.direction === 'in');
  const outgoing = events.filter(e => e.direction === 'out');
  const tokens = [...new Set(events.map(e => e.tokenSymbol))];
  const totalVolume = events.reduce((sum, e) => sum + e.value, 0);

  const correlated = {
    address: addr,
    windowMs: WINDOW_MS,
    eventCount: events.length,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    tokens,
    totalVolume,
    firstSeen: events[0].timestamp,
    lastSeen: events[events.length - 1].timestamp,
    events: events.map(e => ({
      txHash: e.txHash,
      direction: e.direction,
      token: e.tokenSymbol,
      value: e.value,
      timestamp: e.timestamp,
    })),
  };

  brainBus.emit(Channels.COMPLIANCE_CORRELATED, correlated, {
    source: "OperationCorrelator",
    correlationId: addr,
  });
}

// Listen for raw transactions from the observer
brainBus.on(Channels.COMPLIANCE_TRANSACTION, (tx) => {
  // Determine direction relative to monitored addresses
  // (the observer doesn't set it, so we infer: if 'to' is a user address it's incoming)
  // We'll keep it simple: mark as 'in' if 'to' is known, else 'out'.
  // But we don't have the user address list here; better: let the observer set direction later.
  // For now, we'll treat all as unknown and just group by from/to.
  // Actually the observer already filters both sides, so we can check if 'from' or 'to' is user?
  // We'll enhance later. Just store the event.
  const address = tx.to; // Use 'to' as primary address; we could also store under 'from'
  if (!address) return;

  if (!addressWindows.has(address)) {
    addressWindows.set(address, []);
  }
  addressWindows.get(address).push({
    ...tx,
    direction: 'in', // placeholder
  });

  // Emit correlated event immediately after adding (or we could debounce)
  correlateAndEmit(address);
  cleanupWindows();
});

// Also handle 'from' addresses (outgoing)
brainBus.on(Channels.COMPLIANCE_TRANSACTION, (tx) => {
  const address = tx.from;
  if (!address) return;
  if (!addressWindows.has(address)) {
    addressWindows.set(address, []);
  }
  addressWindows.get(address).push({
    ...tx,
    direction: 'out',
  });
  correlateAndEmit(address);
  cleanupWindows();
});

console.log("[OperationCorrelator] Listening on compliance:transaction");

export function startOperationCorrelator() {
  console.log("[OperationCorrelator] Started");
}
