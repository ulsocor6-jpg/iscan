// src/services/compliance/checks/behavioralRisk.js
// Heuristic rules for on-chain behavioral risk scoring

// Known mixer addresses (can be expanded)
const MIXER_ADDRESSES = new Set([
  "0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc",
  "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936",
  "0xa160cdab225685da1d56aa342ad8841c3b53f291",
]);

function isMixerAddress(addr) {
  return MIXER_ADDRESSES.has(addr.toLowerCase());
}

/**
 * @param {object} activity - the correlated activity window
 * @param {object} activity - { eventCount, incomingCount, outgoingCount, tokens, totalVolume, events: [{ from, to, value, ... }] }
 */
export async function evaluateBehavioralRisk(activity) {
  let score = 0;
  const reasons = [];

  // 1. High frequency in short window (>10 tx in 5 min)
  if (activity.eventCount > 10) {
    score += 20;
    reasons.push(`High transaction frequency (${activity.eventCount} tx in 5 min)`);
  }

  // 2. Large total volume (>100k in stablecoins)
  if (activity.totalVolume > 100000) {
    score += 30;
    reasons.push(`Large volume (${activity.totalVolume})`);
  }

  // 3. Round-trip pattern (both incoming and outgoing to same address set)
  const uniqueFrom = new Set(activity.events.map(e => e.from));
  const uniqueTo = new Set(activity.events.map(e => e.to));
  const roundTrip = [...uniqueFrom].some(addr => uniqueTo.has(addr));
  if (roundTrip && activity.eventCount > 4) {
    score += 20;
    reasons.push("Round-trip pattern detected");
  }

  // 4. Interaction with known mixers
  const interactsWithMixer = activity.events.some(
    e => isMixerAddress(e.from) || isMixerAddress(e.to)
  );
  if (interactsWithMixer) {
    score += 50;
    reasons.push("Interaction with known mixer contract");
  }

  // 5. High-speed chain switching (appears if multiple chains in one window – we'll add later)
  // For now, check if tokens involve multiple chains
  // (Not implemented in this version, but we could store chain info in events)

  return {
    passed: score < 40,
    score: Math.min(score, 100),
    reasons,
  };
}
