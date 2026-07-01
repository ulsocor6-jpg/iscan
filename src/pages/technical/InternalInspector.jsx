import { useEffect, useState } from "react";
import DashboardLayout from "../../banking/components/DashboardLayout";

const stageColor = {
  SUCCESS: { bg: "#14532d", color: "#4ade80", icon: "✓" },
  FAILED:  { bg: "#7f1d1d", color: "#f87171", icon: "✗" },
  RUNNING: { bg: "#1e3a5f", color: "#60a5fa", icon: "⟳" },
  SKIPPED: { bg: "#1c1c2e", color: "#64748b", icon: "–" },
  PENDING: { bg: "#1c1c2e", color: "#475569", icon: "·" },
};

const flowStatusColor = {
  SUCCESS: "#4ade80",
  FAILED:  "#f87171",
  RUNNING: "#facc15",
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function StageRow({ stage }) {
  const c = stageColor[stage.status] || stageColor.PENDING;
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 8, paddingLeft: 12, borderLeft: `2px solid ${c.color}` }}>
      <div style={{ minWidth: 100 }}>
        <span style={{ background: c.bg, color: c.color, borderRadius: 4, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
          {c.icon} {stage.status}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{stage.name}
          {stage.durationMs != null && <span style={{ color: "#475569", fontWeight: 400, marginLeft: 8 }}>{stage.durationMs}ms</span>}
        </div>
        {stage.decision?.reason && (
          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>→ {stage.decision.reason}
            {stage.decision.method && <span> via {stage.decision.method}</span>}
            {stage.decision.matched !== undefined && <span> · matched={String(stage.decision.matched)}</span>}
          </div>
        )}
        {stage.error && <div style={{ color: "#f87171", fontSize: 11, marginTop: 2 }}>⚠ {stage.error}</div>}
        {stage.result && (
          <div style={{ color: "#64748b", fontSize: 10, marginTop: 3, fontFamily: "monospace", wordBreak: "break-all" }}>
            {JSON.stringify(stage.result)}
          </div>
        )}
        {stage.query && (
          <div style={{ color: "#475569", fontSize: 10, marginTop: 2, fontFamily: "monospace", wordBreak: "break-all" }}>
            query: {JSON.stringify(stage.query)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pipeline step definitions ────────────────────────────────────────────
const PIPELINE_STEPS = [
  { label: "Receive Event",    stages: ["WATCHER"],                     icon: "📡" },
  { label: "Normalize",        stages: ["PARSER"],                      icon: "🔍" },
  { label: "Duplicate Check",  stages: ["DEDUP"],                       icon: "🔒" },
  { label: "Verify Tx",        stages: ["USER_LOOKUP", "DEPOSIT_MATCH"],icon: "🎯" },
  { label: "Ledger Credit",    stages: ["LEDGER"],                      icon: "📒" },
  { label: "Wallet Update",    stages: ["EVENT_STREAM"],                icon: "💳" },
];

function getStepStatus(stages, stageNames) {
  const matching = (stages || []).filter(s => stageNames.includes(s.name));
  if (matching.length === 0) return "PENDING";
  if (matching.some(s => s.status === "FAILED"))  return "FAILED";
  if (matching.some(s => s.status === "RUNNING")) return "RUNNING";
  if (matching.every(s => s.status === "SUCCESS")) return "SUCCESS";
  return "PENDING";
}

function PipelineProgress({ flow }) {
  // Only show for PHP_DEPOSIT pipelines
  if (flow.pipeline !== "PHP_DEPOSIT") return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
      {PIPELINE_STEPS.map((step, i) => {
        const status = getStepStatus(flow.stages, step.stages);
        const color  = status === "SUCCESS" ? "#4ade80"
                     : status === "FAILED"  ? "#f87171"
                     : status === "RUNNING" ? "#facc15"
                     : "#334155";
        const bg     = status === "SUCCESS" ? "#14532d"
                     : status === "FAILED"  ? "#450a0a"
                     : status === "RUNNING" ? "#422006"
                     : "#0d1526";
        const icon   = status === "SUCCESS" ? "✓"
                     : status === "FAILED"  ? "✗"
                     : status === "RUNNING" ? "⟳"
                     : "·";
        return (
          <div key={step.label} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              background: bg, border: `1px solid ${color}`, borderRadius: 8,
              padding: "6px 10px", textAlign: "center", minWidth: 80,
              transition: "all 0.3s ease",
            }}>
              <div style={{ fontSize: 14 }}>{step.icon}</div>
              <div style={{ color, fontSize: 9, fontWeight: 700, marginTop: 2, lineHeight: 1.2 }}>
                {icon} {step.label}
              </div>
            </div>
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={{ color: "#334155", fontSize: 16, padding: "0 2px", flexShrink: 0 }}>→</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlowCard({ flow }) {
  const [expanded, setExpanded] = useState(flow.status !== "SUCCESS");
  const borderColor = flow.status === "SUCCESS" ? "#166534" : flow.status === "FAILED" ? "#7f1d1d" : "#1e3a5f";

  return (
    <div style={{ background: "#0a0f1e", border: `1px solid ${borderColor}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer", background: "#0d1526" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: flowStatusColor[flow.status] || "#94a3b8", fontSize: 18 }}>
            {flow.status === "SUCCESS" ? "✓" : flow.status === "FAILED" ? "✗" : "⟳"}
          </span>
          <div>
            <div style={{ color: "white", fontWeight: 700, fontSize: 13 }}>
              {flow.pipeline} · {flow.source}
              {flow.amount && <span style={{ color: "#60a5fa", marginLeft: 8 }}>₱{flow.amount}</span>}
              {flow.sender && <span style={{ color: "#94a3b8", marginLeft: 8, fontSize: 12 }}>from {flow.sender}</span>}
            </div>
            <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>
              {flow.flowId} · {timeAgo(flow.createdAt)}
              {flow.referenceId && <span style={{ color: "#f59e0b", marginLeft: 8 }}>{flow.referenceId}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            background: flow.status === "SUCCESS" ? "#14532d" : flow.status === "FAILED" ? "#7f1d1d" : "#1e3a5f",
            color: flowStatusColor[flow.status] || "#94a3b8",
            borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700,
          }}>{flow.status}</span>
          <span style={{ color: "#475569" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "14px 16px", borderTop: `1px solid ${borderColor}` }}>
          {/* Parsed notification summary */}
          {flow.parsedNotification && (
            <div style={{ background: "#0d1526", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 11 }}>
              <div style={{ color: "#64748b", marginBottom: 4, fontWeight: 700 }}>📨 Parsed Notification</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {flow.parsedNotification.amount && <span style={{ color: "#60a5fa" }}>₱{flow.parsedNotification.amount}</span>}
                {flow.parsedNotification.senderPhone && <span style={{ color: "#94a3b8" }}>📞 {flow.parsedNotification.senderPhone}</span>}
                {flow.parsedNotification.senderName && <span style={{ color: "#94a3b8" }}>👤 {flow.parsedNotification.senderName}</span>}
                {flow.parsedNotification.senderLastFour && <span style={{ color: "#94a3b8" }}>****{flow.parsedNotification.senderLastFour}</span>}
                {flow.parsedNotification.recipientLastFour && <span style={{ color: "#4ade80" }}>→ ****{flow.parsedNotification.recipientLastFour}</span>}
                {flow.parsedNotification.channel && <span style={{ color: "#f59e0b" }}>{flow.parsedNotification.channel}</span>}
              </div>
            </div>
          )}

          {/* Pipeline progress */}
          <PipelineProgress flow={flow} />

          {/* Stages */}
          {flow.stages?.length > 0
            ? flow.stages.map((s, i) => <StageRow key={i} stage={s} />)
            : <div style={{ color: "#475569", fontSize: 12 }}>No stages recorded yet</div>
          }

          {/* Raw notification toggle */}
          {flow.rawNotification && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ color: "#334155", fontSize: 11, cursor: "pointer" }}>Raw notification</summary>
              <pre style={{ color: "#475569", fontSize: 10, marginTop: 6, overflow: "auto", maxHeight: 200 }}>
                {JSON.stringify(flow.rawNotification, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default function InternalInspector() {
  const [flows, setFlows] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [clearing, setClearing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  async function loadFlows() {
    try {
      const res = await fetch("/api/admin/inspector", { credentials: "include" });
      const data = await res.json();
      if (Array.isArray(data)) { setFlows(data); setLastUpdate(new Date()); }
    } catch (e) { console.error(e); }
  }

  async function clearFlows() {
    setClearing(true);
    await fetch("/api/admin/inspector/clear", { method: "DELETE", credentials: "include" });
    setFlows([]);
    setClearing(false);
  }

  useEffect(() => {
    loadFlows();
    const id = setInterval(loadFlows, 2000);
    return () => clearInterval(id);
  }, []);

  const counts = { ALL: flows.length, SUCCESS: 0, FAILED: 0, RUNNING: 0 };
  flows.forEach(f => { if (counts[f.status] !== undefined) counts[f.status]++; });
  const filtered = filter === "ALL" ? flows : flows.filter(f => f.status === filter);

  return (
    <DashboardLayout>
      <div className="dashboard">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, color: "white" }}>🔬 Internal Inspector</h2>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
              Live pipeline tracker · last updated {lastUpdate.toLocaleTimeString()}
            </div>
          </div>
          <button onClick={clearFlows} disabled={clearing} style={{
            background: "#7f1d1d", border: "none", borderRadius: 8, color: "white",
            padding: "8px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700,
          }}>🗑 Clear All</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["ALL", "RUNNING", "SUCCESS", "FAILED"].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 12,
              background: filter === s ? "#3b82f6" : "#1d2942", color: "white",
            }}>
              {s} ({counts[s]})
            </button>
          ))}
        </div>

        {filtered.length === 0
          ? <div style={{ color: "#475569", textAlign: "center", padding: "60px 0", fontSize: 14 }}>Waiting for pipeline events...</div>
          : filtered.map(f => <FlowCard key={f.flowId} flow={f} />)
        }
      </div>
    </DashboardLayout>
  );
}
