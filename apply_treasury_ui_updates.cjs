// apply_treasury_ui_updates.js
// Run with: node apply_treasury_ui_updates.js
// Applies the 6 Rebalance-tab edits to src/pages/Treasury.tsx safely —
// each replacement is verified to match EXACTLY ONCE before being applied.
// If any anchor text doesn't match (e.g. the file differs slightly from
// what this script expects), it aborts with a clear error and makes NO
// changes at all, rather than partially patching or guessing.

const fs = require("fs");
const path = require("path");

const FILE = path.join("src", "pages", "Treasury.tsx");

if (!fs.existsSync(FILE)) {
  console.error(`ERROR: ${FILE} not found. Run this script from your repo root.`);
  process.exit(1);
}

let content = fs.readFileSync(FILE, "utf8");
const original = content;

function replaceOnce(label, oldStr, newStr) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) {
    throw new Error(`[${label}] anchor text not found — aborting with NO changes made. Paste the current Treasury.tsx back and I'll adjust.`);
  }
  if (count > 1) {
    throw new Error(`[${label}] anchor text matched ${count} times (expected exactly 1) — aborting with NO changes made, ambiguous replace target.`);
  }
  content = content.split(oldStr).join(newStr);
  console.log(`  ✓ [${label}] applied`);
}

try {
  // 1. Import
  replaceOnce(
    "1/6 add import",
    `import { useState, useEffect, useCallback } from "react";`,
    `import { useState, useEffect, useCallback } from "react";\nimport TreasuryRebalance from "../banking/components/dashboard/TreasuryRebalance";`
  );

  // 2. Tab type union
  replaceOnce(
    "2/6 widen tab type",
    `const [tab,     setTab]     = useState<"pools"|"fees"|"wallets">("pools");`,
    `const [tab,     setTab]     = useState<"pools"|"fees"|"wallets"|"rebalance">("pools");`
  );

  // 3. sweepIntents state (placed right after the accounts state declaration)
  replaceOnce(
    "3/6 add sweepIntents state",
    `  const [accounts, setAccounts] = useState<any[]>([]);`,
    `  const [accounts, setAccounts] = useState<any[]>([]);\n  const [sweepIntents, setSweepIntents] = useState<any[]>([]);`
  );

  // 4. load() Promise.all — add sweep-intents fetch
  replaceOnce(
    "4/6 fetch sweep-intents in load()",
    `    const [f, w, p, a] = await Promise.all([
      fetch("/api/v1/treasury/fees",    { credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/treasury/wallets", { credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/treasury/pools",   { credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/treasury/accounts",{ credentials:"include" }).then(r => r.json()),
    ]);
    setFees(f);
    setWallets(w.wallets || []);
    setPools(p.pools || []);
    setAccounts(a.accounts || []);
    setLoading(false);`,
    `    const [f, w, p, a, si] = await Promise.all([
      fetch("/api/v1/treasury/fees",    { credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/treasury/wallets", { credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/treasury/pools",   { credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/treasury/accounts",{ credentials:"include" }).then(r => r.json()),
      fetch("/api/v1/admin/treasury/sweep-intents", { credentials:"include" }).then(r => r.json()),
    ]);
    setFees(f);
    setWallets(w.wallets || []);
    setPools(p.pools || []);
    setAccounts(a.accounts || []);
    setSweepIntents(si.operations || []);
    setLoading(false);`
  );

  // 5. New handler functions (after handleUpdateAccount)
  replaceOnce(
    "5/6 add handleRebalance + handleCreateSweepIntent",
    `  async function handleUpdateAccount(accountId: string, data: any) {
    await fetch(\`/api/v1/treasury/accounts/\${accountId}\`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    load();
  }`,
    `  async function handleUpdateAccount(accountId: string, data: any) {
    await fetch(\`/api/v1/treasury/accounts/\${accountId}\`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    load();
  }

  async function handleRebalance(sourceAccountId: string, destinationAccountId: string, amount: number, note: string) {
    const res = await fetch("/api/v1/admin/treasury/rebalance", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceAccountId, destinationAccountId, amount, note }),
    }).then(r => r.json());
    if (res.success) { flash("✅ Rebalance recorded"); load(); }
    else flash("❌ " + (res.error ?? "Rebalance failed"), "error");
  }

  async function handleCreateSweepIntent(
    sourcePhpAccountId: string, phpAmount: number, expectedAsset: string,
    expectedAssetAmount: number, expirationMinutes: number
  ) {
    const res = await fetch("/api/v1/admin/treasury/sweep-intent", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourcePhpAccountId, phpAmount, expectedAsset, expectedAssetAmount, expirationMinutes }),
    }).then(r => r.json());
    if (res.success) { flash(\`✅ Sweep intent declared — watching for \${expectedAssetAmount} \${expectedAsset}\`); load(); }
    else flash("❌ " + (res.error ?? "Failed to declare sweep intent"), "error");
  }`
  );

  // 6. Tab buttons + tab content
  replaceOnce(
    "6/6 add tab button + tab content",
    `          <button style={tabBtn("pools")}   onClick={() => setTab("pools")}>🏦 Liquidity Pools</button>
          <button style={tabBtn("fees")}    onClick={() => setTab("fees")}>💰 Fee Analytics</button>
          <button style={tabBtn("wallets")} onClick={() => setTab("wallets")}>👛 Wallets</button>`,
    `          <button style={tabBtn("pools")}     onClick={() => setTab("pools")}>🏦 Liquidity Pools</button>
          <button style={tabBtn("fees")}      onClick={() => setTab("fees")}>💰 Fee Analytics</button>
          <button style={tabBtn("wallets")}   onClick={() => setTab("wallets")}>👛 Wallets</button>
          <button style={tabBtn("rebalance")} onClick={() => setTab("rebalance")}>🔁 Rebalance</button>`
  );

  replaceOnce(
    "6/6b insert rebalance tab content block",
    `          </div>
        )}

      </div>
    </DashboardLayout>
  );
}`,
    `          </div>
        )}

        {/* ── REBALANCE TAB ── */}
        {tab === "rebalance" && (
          <TreasuryRebalance
            accounts={accounts}
            sweepIntents={sweepIntents}
            onRebalance={handleRebalance}
            onCreateSweepIntent={handleCreateSweepIntent}
          />
        )}

      </div>
    </DashboardLayout>
  );
}`
  );

  fs.writeFileSync(FILE, content, "utf8");
  console.log(`\n✅ All 6 edits applied successfully to ${FILE}`);
  console.log(`   Original backed up at ${FILE}.bak`);
  fs.writeFileSync(FILE + ".bak", original, "utf8");

} catch (err) {
  console.error(`\n❌ ABORTED — no changes written to ${FILE}`);
  console.error(err.message);
  process.exit(1);
}
