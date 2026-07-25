// src/services/compliance/checks/contractAnalysis.js
import TokenWhitelist from "../../../models/compliance/TokenWhitelist.js";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const BASE_API = "https://api.basescan.org/api"; // Base chain Etherscan

/**
 * Check if a token contract is verified and detect proxy patterns.
 * @param {string[]} symbols
 * @returns {object} { passed, score, reasons }
 */
export async function checkContractAnalysis(symbols) {
  if (!ETHERSCAN_API_KEY) {
    // Fail toward caution – no API key means we CANNOT verify contract
    // safety at all. Treating that as "clean" was the bug; treat it as
    // elevated risk instead so it routes to REVIEW, not silent approval.
    return { passed: false, score: 50, reasons: ["Contract analysis unavailable — ETHERSCAN_API_KEY not set"] };
  }

  const entries = await TokenWhitelist.find({ symbol: { $in: symbols } }).lean();
  const addrMap = new Map(entries.map(e => [e.symbol, e.address]));
  let totalScore = 0;
  const reasons = [];

  for (const symbol of symbols) {
    const address = addrMap.get(symbol);
    if (!address) continue;

    // Check contract verification status
    try {
      const url = `${BASE_API}?module=contract&action=getabi&address=${address}&apikey=${ETHERSCAN_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === "0" && data.result === "Contract source code not verified") {
        totalScore += 20;
        reasons.push(`${symbol} (${address}) is not verified`);
      }
    } catch (err) {
      console.error(`[ContractAnalysis] Etherscan check failed for ${address}:`, err.message);
      // A failed verification check is not the same as a verified-clean
      // contract — count it as a moderate risk contribution, not zero.
      totalScore += 15;
      reasons.push(`${symbol} (${address}) verification check failed: ${err.message}`);
    }

    // Simple proxy detection: check if bytecode is a minimal proxy (EIP-1167)
    try {
      const code = await fetch(`${BASE_API}?module=proxy&action=eth_getCode&address=${address}&apikey=${ETHERSCAN_API_KEY}`);
      const codeData = await code.json();
      const bytecode = codeData.result;
      if (bytecode && bytecode.startsWith("0x363d3d373d3d3d363d73")) {
        totalScore += 10;
        reasons.push(`${symbol} (${address}) appears to be a minimal proxy`);
      }
    } catch (err) {
      // Ignore
    }
  }

  const avgScore = symbols.length > 0 ? Math.min(totalScore / symbols.length, 100) : 0;
  return {
    passed: avgScore < 30,
    score: Math.round(avgScore),
    reasons,
  };
}
