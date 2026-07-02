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

function getMatchingStages(stages, stageNames) {
  return (stages || []).filter(s => stageNames.includes(s.name));
}

function getStepStatus(matching) {
  if (matching.length === 0) return "PENDING";
  if (matching.some(s => s.status === "FAILED"))  return "FAILED";
  if (matching.some(s => s.status === "RUNNING")) return "RUNNING";
  if (matching.every(s => s.status === "SUCCESS")) return "SUCCESS";
  return "PENDING";
}

// Explains what a PENDING (no matching stage entries at all) step actually
// means in context — a stage with zero log entries is ambiguous on its own:
// it could mean "hasn't been reached yet" (normal, upstream steps still
// running) or "silently stalled" (a bug — code path returned/exited without
// ever calling startStage/failStage). We can't know which for certain from
// the frontend alone, but we can at least say so explicitly instead of
// showing nothing, which is what prompted this fix in the first place.
function pendingExplanation(step, flow, stepIndex) {
  const isFlowStillRunning = flow.status === "RUNNING";
  const anyLaterStepStarted = PIPELINE_STEPS.slice(stepIndex + 1).some(
    laterStep => getMatchingStages(flow.stages, laterStep.stages).length > 0
  );

  if (anyLaterStepStarted) {
    return {
      tone: "warn",
      text: "No log entries for this stage, but a later stage already has entries. This stage may be missing Inspector instrumentation on the backend (no startStage/failStage call in this code path) — it did not literally run to nothing, it simply isn't being recorded.",
    };
  }
  if (isFlowStillRunning) {
    return {
      tone: "neutral",
      text: "Hasn't started yet. If the flow has been RUNNING for more than a few seconds and this step still shows nothing, the code likely returned early (e.g. an unrecorded duplicate/validation exit) without ever calling startStage on this stage — check the corresponding route/service for an early return that isn't wrapped in Inspector calls.",
    };
  }
  return {
    tone: "neutral",
    text: "Flow ended without this stage ever running. If the flow's final status is FAILED or SUCCESS despite this, an earlier stage likely short-circuited the pipeline before reaching this step.",
  };
}

function PipelineProgress({ flow }) {
  const [selectedIndex, setSelectedIndex] = useState(null);

  // Only show for PHP_DEPOSIT pipelines
  if (flow.pipeline !== "PHP_DEPOSIT") return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
        {PIPELINE_STEPS.map((step, i) => {
          const matching = getMatchingStages(flow.stages, step.stages);
          const status   = getStepStatus(matching);
          const isSelected = selectedIndex === i;
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
              <button
                onClick={() => setSelectedIndex(isSelected ? null : i)}
                style={{
                  background: bg,
                  border: isSelected ? `2px solid ${color}` : `1px solid ${color}`,
                  borderRadius: 8,
                  padding: isSelected ? "5px 9px" : "6px 10px",
                  textAlign: "center", minWidth: 80,
                  transition: "all 0.15s ease",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: isSelected ? `0 0 0 3px ${color}33` : "none",
                }}
                title="Click to see what happened at this stage"
              >
                <div style={{ fontSize: 14 }}>{step.icon}</div>
                <div style={{ color, fontSize: 9, fontWeight: 700, marginTop: 2, lineHeight: 1.2 }}>
                  {icon} {step.label}
                </div>
              </button>
              {i < PIPELINE_STEPS.length - 1 && (
                <div style={{ color: "#334155", fontSize: 16, padding: "0 2px", flexShrink: 0 }}>→</div>
              )}
            </div>
          );
        })}
      </div>

      {selectedIndex !== null && (() => {
        const step = PIPELINE_STEPS[selectedIndex];
        const matching = getMatchingStages(flow.stages, step.stages);
        return (
          <div style={{
            marginTop: 10, background: "#0d1526", border: "1px solid #1e293b",
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: matching.length ? 8 : 0 }}>
              <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>
                {step.icon} {step.label}
              </div>
              <button
                onClick={() => setSelectedIndex(null)}
                style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 12 }}
              >
                ✕ close
              </button>
            </div>

            {matching.length > 0
              ? matching.map((s, i) => <StageRow key={i} stage={s} />)
              : (() => {
                  const explanation = pendingExplanation(step, flow, selectedIndex);
                  const isWarn = explanation.tone === "warn";
                  return (
                    <div style={{
                      color: isWarn ? "#fbbf24" : "#64748b",
                      fontSize: 12, lineHeight: 1.5,
                      background: isWarn ? "#422006" : "transparent",
                      border: isWarn ? "1px solid #92400e" : "none",
                      borderRadius: 6,
                      padding: isWarn ? "8px 10px" : 0,
                    }}>
                      {isWarn ? "⚠ " : ""}{explanation.text}
                    </div>
                  );
                })()
            }
          </div>
        );
      })()}
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

          {/* Pipeline progress — now clickable per-stage */}
          <PipelineProgress flow={flow} />

          {/* Full stage log (kept as-is for a complete chronological view) */}
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
  const [sourceFilter, setSourceFilter] = useState("ALL");
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

  // Sources are derived from whatever's actually in the data rather than
  // hardcoded, so this stays correct automatically as new watchers
  // (e.g. a future GCash or PayMaya source) get added without needing
  // another manual edit here.
  const sourceCounts = {};
  flows.forEach(f => { sourceCounts[f.source] = (sourceCounts[f.source] || 0) + 1; });
  const availableSources = Object.keys(sourceCounts).sort();

  const filtered = flows.filter(f => {
    const statusMatch = filter === "ALL" || f.status === filter;
    const sourceMatch = sourceFilter === "ALL" || f.source === sourceFilter;
    return statusMatch && sourceMatch;
  });

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

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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

        {availableSources.length > 1 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "#475569", fontSize: 11, fontWeight: 700, marginRight: 4 }}>SOURCE:</span>
            <button onClick={() => setSourceFilter("ALL")} style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid #1d2942", cursor: "pointer",
              fontWeight: 700, fontSize: 11,
              background: sourceFilter === "ALL" ? "#334155" : "transparent",
              color: sourceFilter === "ALL" ? "white" : "#94a3b8",
            }}>
              ALL ({flows.length})
            </button>
            {availableSources.map(src => (
              <button key={src} onClick={() => setSourceFilter(src)} style={{
                padding: "4px 12px", borderRadius: 6, border: "1px solid #1d2942", cursor: "pointer",
                fontWeight: 700, fontSize: 11,
                background: sourceFilter === src ? "#334155" : "transparent",
                color: sourceFilter === src ? "white" : "#94a3b8",
              }}>
                {src} ({sourceCounts[src]})
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0
          ? <div style={{ color: "#475569", textAlign: "center", padding: "60px 0", fontSize: 14 }}>Waiting for pipeline events...</div>
          : filtered.map(f => <FlowCard key={f.flowId} flow={f} />)
        }
      </div>
    </DashboardLayout>
  );
}
