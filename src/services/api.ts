const API_BASE = "/api/v1";

/* =========================
   DASHBOARD
========================= */
export async function getDashboard() {
  const res = await fetch(`${API_BASE}/dashboard/overview`, {
    credentials: "include"
  });

  if (!res.ok) throw new Error("Dashboard request failed");

  const json = await res.json();
  return json.data;
}

/* =========================
   DEPOSIT ADDRESS
========================= */
export async function createDepositAddress() {
  const res = await fetch(`${API_BASE}/onramp/deposit-address`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({})
  });

  const json = await res.json();

  if (!res.ok) throw new Error(json.message || "Deposit failed");

  return json.data;
}

/* =========================
   TRANSFER (placeholder endpoint)
========================= */
export async function transferFunds(payload: {
  to: string;
  amount: number;
}) {
  const res = await fetch(`${API_BASE}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const json = await res.json();

  if (!res.ok) throw new Error(json.message || "Transfer failed");

  return json.data;
}

/* =========================
   SWAP
========================= */
export async function swapTokens(payload: {
  from: string;
  to: string;
  amount: number;
}) {
  const res = await fetch(`${API_BASE}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const json = await res.json();

  if (!res.ok) throw new Error(json.message || "Swap failed");

  return json.data;
}

/* =========================
   REMITTANCE
========================= */
export async function sendRemittance(payload: {
  recipient: string;
  amount: number;
  channel: string;
}) {
  const res = await fetch(`${API_BASE}/remittance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  const json = await res.json();

  if (!res.ok) throw new Error(json.message || "Remittance failed");

  return json.data;
}
