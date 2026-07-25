// src/services/compliance/checks/tokenSecurityCheck.js
import TokenWhitelist from "../../../models/compliance/TokenWhitelist.js";

const GOPLUS_BASE_URL = "https://api.gopluslabs.io/api/v1/token_security/8453"; // Base chain ID

/**
 * Fetch token security data from GoPlus for the given token addresses.
 * @param {string[]} symbols - token symbols
 * @returns {object} { passed, score, reasons }
 */
export async function checkTokenSecurity(symbols) {
  // Resolve symbols to addresses using the whitelist
  const entries = await TokenWhitelist.find({ symbol: { $in: symbols } }).lean();
  const addrMap = new Map(entries.map(e => [e.symbol, e.address]));

  const addresses = symbols.map(s => addrMap.get(s)).filter(Boolean);
  if (addresses.length === 0) {
    return { passed: true, score: 0, reasons: [] };
  }

  const query = addresses.join(",");
  let data;
  try {
    const res = await fetch(`${GOPLUS_BASE_URL}?contract_addresses=${query}`);
    data = await res.json();
  } catch (err) {
    console.error("[TokenSecurity] GoPlus request failed:", err.message);
    // Fail toward caution – we could not verify honeypot/tax/proxy status
    // at all. That's an unknown, not a clean bill of health.
    return { passed: false, score: 50, reasons: ["Token security check unavailable — GoPlus API request failed"] };
  }

  let totalScore = 0;
  const reasons = [];

  for (const addr of addresses) {
    const result = data?.result?.[addr.toLowerCase()];
    if (!result) continue;

    // High risk indicators
    if (result.is_honeypot === "1") {
      totalScore += 40;
      reasons.push(`${addr} is a honeypot`);
    }
    if (parseFloat(result.sell_tax) > 10 || parseFloat(result.buy_tax) > 10) {
      totalScore += 30;
      reasons.push(`${addr} has high tax`);
    }
    if (result.is_open_source === "0") {
      totalScore += 15;
      reasons.push(`${addr} is not open-source`);
    }
    if (result.is_proxy === "1") {
      totalScore += 10;
      reasons.push(`${addr} is a proxy contract`);
    }
    if (result.owner_change_balance === "1") {
      totalScore += 20;
      reasons.push(`${addr} owner can modify balance`);
    }
  }

  // Normalize score to 0-100 per token, then average?
  const avgScore = addresses.length > 0 ? Math.min(totalScore / addresses.length, 100) : 0;
  return {
    passed: avgScore < 30,
    score: Math.round(avgScore),
    reasons,
  };
}
