// src/services/compliance/checks/walletAmlCheck.js
// AML screening using a local deny-list.
// Replace/expand with Chainalysis, TRM, or Elliptic API calls when available.

const BLOCKED_AML_ADDRESSES = new Set([
  // Example known scam / darknet / ransomware addresses – replace with real data
  "0x8576acc5c05d6ce88f4e49bf65bdf0c62f91353c", // fake example
  "0x901bb9583b24d97e995513c6778dc6888ab6870e", // fake example
]);

export async function checkWalletAml(address) {
  const addr = address.toLowerCase();
  if (BLOCKED_AML_ADDRESSES.has(addr)) {
    return {
      passed: false,
      score: 100,
      reason: "Address flagged in AML deny-list",
    };
  }
  // Future: call Chainalysis/TRM here
  return { passed: true, score: 0 };
}
