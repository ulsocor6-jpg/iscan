import { useState, useRef, useEffect } from "react";
import { useBackground } from "../../hooks/useBackground";

const PRESETS = [
  { key: "frieren", label: "Frieren", thumb: "/assets/frieren-bg.jpg" },
];

export default function BackgroundPicker() {
  const { background, setBackground } = useBackground();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  async function selectPreset(key: string) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/v1/user/background/preset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set background");
      setBackground(data.background);
      setOpen(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function clearBackground() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/v1/user/background", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to clear background");
      setBackground({ type: "none", value: "" });
      setOpen(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} title="Background">
        🖼️
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            background: "#0d1526",
            border: "1px solid #1d2942",
            borderRadius: 14,
            width: 220,
            zIndex: 999,
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            padding: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>
            Background
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => selectPreset(p.key)}
                disabled={busy}
                style={{
                  padding: 0,
                  border:
                    background.type === "preset" && background.value === p.thumb
                      ? "2px solid #3b82f6"
                      : "2px solid transparent",
                  borderRadius: 8,
                  overflow: "hidden",
                  cursor: "pointer",
                  width: 60,
                  height: 60,
                }}
                title={p.label}
              >
                <img
                  src={p.thumb}
                  alt={p.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </button>
            ))}
          </div>

          {background.type !== "none" && (
            <button
              onClick={clearBackground}
              disabled={busy}
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "8px 0",
                borderRadius: 8,
                border: "none",
                background: "none",
                color: "#ef4444",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Remove background
            </button>
          )}

          {err && <div style={{ color: "#ef4444", fontSize: 11, marginTop: 8 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
