// src/services/compliance/checks/sanctionsCheck.js
// A lightweight OFAC/UN sanctions screening using a local deny-list.
// Extend with live API calls when needed (Chainalysis sanctions oracle, OpenSanctions, etc.)

// Known sanctioned / high‑risk addresses (Tornado Cash contracts, etc.)
const BLOCKED_ADDRESSES = new Set([
  "0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc",  // Tornado Cash 0.1 ETH
  "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936",  // Tornado Cash 1 ETH
  "0x910cbd523d972eb0a6f4c4e83b8c2b0e0e8e8e8e",  // placeholder – replace with real OFAC additions
]);

// High‑risk patterns (e.g., known mixer addresses)
const HIGH_RISK = new Set([
  "0xa160cdab225685da1d56aa342ad8841c3b53f291",  // Tornado Cash Router (example)
]);

export async function checkSanctions(address) {
  const addr = address.toLowerCase();
  if (BLOCKED_ADDRESSES.has(addr)) {
    return {
      passed: false,
      score: 100,
      reason: "Sanctioned address (OFAC/UN)",
    };
  }
  if (HIGH_RISK.has(addr)) {
    return {
      passed: false,
      score: 75,
      reason: "Address flagged as high-risk (mixer/scam)",
    };
  }
  return { passed: true, score: 0 };
}
