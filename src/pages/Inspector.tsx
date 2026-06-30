import DashboardLayout from "../banking/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";

interface IngressEvent {
  _id: string;
  source: string;
  eventId: string;
  status: "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED";
  receivedAt: string;
  processedAt?: string;
  failureReason?: string;
  metadata?: Record<string, any>;
}

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusPill(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    RECEIVED:   { bg: "#1e3a5f", color: "#60a5fa", label: "Received" },
    PROCESSING: { bg: "#2d1f42", color: "#c084fc", label: "Processing" },
    PROCESSED:  { bg: "#14532d", color: "#4ade80", label: "Processed" },
    FAILED:     { bg: "#3b1f1f", color: "#f87171", label: "Failed" },
    IGNORED:    { bg: "#1e293b", color: "#64748b", label: "Ignored" },
  };
  const s = map[status] || { bg: "#1d2942", color: "#94a3b8", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 6,
      padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>{s.label}</span>
  );
}

// A watcher is considered "live" if it has reported an event within this window.
const LIVE_WINDOW_MS = 5 * 60 * 1000;

function WatcherHealthCard({
  name, icon, events,
}: { name: string; icon: string; events: IngressEvent[] }) {
  const last = events[0];
  const lastAgeMs = last ? Date.now() - new Date(last.receivedAt).getTime() : Infinity;
  const isLive = lastAgeMs <= LIVE_WINDOW_MS;
  const failed = events.filter(e => e.status === "FAILED").length;
  const processed = events.filter(e => e.status === "PROCESSED").length;

  return (
    <div style={{
      background: "#0d1526", border: `1px solid ${isLive ? "#14532d" : "#1d2942"}`,
      borderRadius: 12, padding: "18px 22px", flex: 1, minWidth: 240,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ color: "white", fontWeight: 700, fontSize: 15 }}>{name}</span>
        <span style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
          color: isLive ? "#4ade80" : "#64748b", fontSize: 12, fontWeight: 700,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isLive ? "#4ade80" : "#475569",
            boxShadow: isLive ? "0 0 8px #4ade80" : "none",
          }} />
          {isLive ? "LIVE" : "IDLE"}
        </span>
      </div>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>
        Last event: <span style={{ color: "#94a3b8" }}>{timeAgo(last?.receivedAt)}</span>
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        <div>
          <div style={{ color: "#475569", fontSize: 11 }}>TOTAL</div>
          <div style={{ color: "white", fontWeight: 700, fontSize: 18 }}>{events.length}</div>
        </div>
        <div>
          <div style={{ color: "#475569", fontSize: 11 }}>PROCESSED</div>
          <div style={{ color: "#4ade80", fontWeight: 700, fontSize: 18 }}>{processed}</div>
        </div>
        <div>
          <div style={{ color: "#475569", fontSize: 11 }}>FAILED</div>
          <div style={{ color: failed ? "#f87171" : "#475569", fontWeight: 700, fontSize: 18 }}>{failed}</div>
        </div>
      </div>
    </div>
  );
}

export default function Inspector() {
  const [events, setEvents] = useState<IngressEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/deposit/admin/ingress", { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setEvents(data.events || []);
        setError("");
      } else {
        setError(data.error || "Failed to load watcher events");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load watcher events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const mayaEvents = events
    .filter(e => e.source === "MAYA")
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());

  const otherSources = Array.from(new Set(events.filter(e => e.source !== "MAYA").map(e => e.source)));

  return (
    <DashboardLayout>
      <div style={{ padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1 style={{ color: "white", fontSize: 24, fontWeight: 700, margin: 0 }}>Inspector</h1>
        </div>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 24 }}>
          Live status of ingress watchers · refreshes every 15s
        </div>

        {error && (
          <div style={{ color: "#f87171", marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}

        {/* Watcher health cards */}
        <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
          <WatcherHealthCard name="Maya Watcher" icon="🟣" events={mayaEvents} />
          {otherSources.map(src => (
            <WatcherHealthCard
              key={src}
              name={`${src} Watcher`}
              icon="📡"
              events={events.filter(e => e.source === src)}
            />
          ))}
        </div>

        {/* Maya watcher event log */}
        <div style={{ color: "white", fontWeight: 700, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          🟣 Maya Watcher — Recent Events
          <span style={{ background: "#1d2942", color: "#94a3b8", borderRadius: 6, fontSize: 11, padding: "2px 8px" }}>
            {mayaEvents.length}
          </span>
        </div>

        <div>
          {loading ? (
            <div style={{ color: "#475569", textAlign: "center", padding: "40px 0", fontSize: 14 }}>Loading…</div>
          ) : mayaEvents.length === 0 ? (
            <div style={{ color: "#475569", textAlign: "center", padding: "40px 0", fontSize: 14 }}>
              No Maya watcher events yet
            </div>
          ) : mayaEvents.map(e => (
            <div key={e._id} style={{
              background: "#0d1526",
              border: `1px solid ${e.status === "PROCESSED" ? "#14532d" : e.status === "FAILED" ? "#7f1d1d" : "#1d2942"}`,
              borderRadius: 10, padding: "14px 20px", marginBottom: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ color: "white", fontWeight: 700 }}>🟣 MAYA</span>
                {statusPill(e.status)}
                <span style={{ color: "#475569", fontSize: 11 }}>{timeAgo(e.receivedAt)}</span>
              </div>
              <div style={{ color: "#64748b", fontSize: 12 }}>
                {e.metadata?.amount && <span style={{ marginRight: 12 }}>Amount: ₱{e.metadata.amount}</span>}
                {e.metadata?.senderPhone && <span style={{ marginRight: 12 }}>Phone: {e.metadata.senderPhone}</span>}
                {e.metadata?.senderName && <span style={{ marginRight: 12 }}>Name: {e.metadata.senderName}</span>}
                {e.metadata?.referenceId && <span style={{ marginRight: 12 }}>Ref: {e.metadata.referenceId}</span>}
                {e.failureReason && <span style={{ color: "#f87171" }}>Error: {e.failureReason}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
