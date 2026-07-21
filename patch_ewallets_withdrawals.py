#!/usr/bin/env python3
"""
Restructures the withdrawal channel selector: groups MAYA + GCASH under an
"E-Wallets" header, keeps BANK separate, and disables the GCASH button
(no backend support exists for it yet).

Run from repo root: python3 patch_ewallets_withdrawals.py
Aborts loudly (no partial writes) if the anchor text isn't found.
"""
import sys

TARGET = "src/pages/Withdrawals.tsx"

OLD = """      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["MAYA","BANK","GCASH"].map(c => (
          <button key={c} onClick={() => setChannel(c)} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
            cursor: "pointer", fontWeight: 600, fontSize: 13,
            background: channel === c ? "#3b82f6" : "#1d2942", color: "white",
          }}>
            {c === "MAYA" ? "\U0001f7e3 Maya" : c === "BANK" ? "\U0001f3e6 Bank" : "\U0001f499 GCash"}
          </button>
        ))}
      </div>"""

NEW = """      <div style={{ marginBottom: 16 }}>
        <label style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
          E-Wallets
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 4, marginBottom: 12 }}>
          {["MAYA","GCASH"].map(c => {
            const disabled = c === "GCASH";
            return (
              <button key={c} onClick={() => !disabled && setChannel(c)} disabled={disabled} style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
                cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13,
                background: disabled ? "#151d30" : (channel === c ? "#3b82f6" : "#1d2942"),
                color: disabled ? "#4b5563" : "white",
                opacity: disabled ? 0.6 : 1,
              }}>
                {c === "MAYA" ? "\U0001f7e3 Maya" : "\U0001f499 GCash"}{disabled ? " (Unavailable)" : ""}
              </button>
            );
          })}
        </div>
        <label style={{ color: "#94a3b8", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Bank
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={() => setChannel("BANK")} style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
            cursor: "pointer", fontWeight: 600, fontSize: 13,
            background: channel === "BANK" ? "#3b82f6" : "#1d2942", color: "white",
          }}>
            \U0001f3e6 Bank
          </button>
        </div>
      </div>"""

def main():
    with open(TARGET, "r", encoding="utf-8") as f:
        content = f.read()

    if content.count(OLD) == 0:
        print(f"ABORT: anchor text not found in {TARGET}. No changes made.", file=sys.stderr)
        sys.exit(1)
    if content.count(OLD) > 1:
        print(f"ABORT: anchor text matched {content.count(OLD)} times in {TARGET} (expected 1). No changes made.", file=sys.stderr)
        sys.exit(1)

    content = content.replace(OLD, NEW)

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"OK: patched {TARGET}")

if __name__ == "__main__":
    main()
