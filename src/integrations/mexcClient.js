// src/integrations/mexcClient.js
// Minimal signed client for MEXC's public Spot v3 API — READ-ONLY usage
// only (account balance polling). Does NOT place orders. MEXC's P2P
// marketplace buy is done manually by admin in the MEXC app — there is no
// reliable public API for automated P2P order placement (the P2P Open API
// is merchant-gated and separate from this Spot API entirely). This client
// only observes the *result* of that manual trade landing in the account.
//
// Signing scheme per https://mexcdevelop.github.io/apidocs/spot_v3_en/:
// HMAC-SHA256 over the query string, keyed with MEXC_API_SECRET.

import crypto from "crypto";

const MEXC_BASE = "https://api.mexc.com";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — cannot call MEXC API`);
  }
  return value;
}

function sign(queryString, secret) {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

async function signedGet(path, params = {}) {
  const apiKey = requireEnv("MEXC_API_KEY");
  const apiSecret = requireEnv("MEXC_API_SECRET");

  const query = new URLSearchParams({
    ...params,
    timestamp: Date.now().toString(),
    recvWindow: "5000",
  });

  const queryString = query.toString();
  const signature = sign(queryString, apiSecret);
  const url = `${MEXC_BASE}${path}?${queryString}&signature=${signature}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "X-MEXC-APIKEY": apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MEXC API error ${res.status}: ${body}`);
  }

  return res.json();
}

// GET /api/v3/account — { balances: [{ asset, free, locked }, ...] }
export async function getAccountBalances() {
  const data = await signedGet("/api/v3/account");
  return data.balances || [];
}

export async function getAssetBalance(asset) {
  const balances = await getAccountBalances();
  const entry = balances.find(b => b.asset === asset);
  if (!entry) return { asset, free: 0, locked: 0 };
  return { asset, free: parseFloat(entry.free), locked: parseFloat(entry.locked) };
}

export default { getAccountBalances, getAssetBalance };
