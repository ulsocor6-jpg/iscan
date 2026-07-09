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
