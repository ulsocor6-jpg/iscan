// Visual pipeline tracker — shows each ingestion stage as a node with live status.
// Stage names MUST match InspectorStage constants exactly (all-caps) or matching silently fails.
const STAGES = [
  "WATCHER",
  "PARSER",
  "DEDUP",
  "USER_LOOKUP",
  "DEPOSIT_MATCH",
  "VERIFIER",
  "LEDGER",
  "WALLET",
  "EVENT_STREAM",
  "SETTLEMENT",
];

const STATUS_STYLE = {
  SUCCESS: { bg: "#14532d", ring: "#4ade80", text: "#4ade80", icon: "✓" },
  FAILED:  { bg: "#7f1d1d", ring: "#f87171", text: "#f87171", icon: "✗" },
  RUNNING: { bg: "#1e3a5f", ring: "#60a5fa", text: "#60a5fa", icon: "⟳" },
  SKIPPED: { bg: "#1c1c2e", ring: "#475569", text: "#64748b", icon: "–" },
  NONE:    { bg: "#0d1526", ring: "#1d2942", text: "#334155", icon: "·" },
};

function StageNode({ label, status, isLast }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.NONE;
  return (
    <div style={{ display: "flex", alignItems: "center", flex: isLast ? "0 0 auto" : 1 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: s.bg, border: `2px solid ${s.ring}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: s.text, fontWeight: 700, fontSize: 14,
            boxShadow: status === "RUNNING" ? `0 0 10px ${s.ring}` : "none",
          }}
        >
          {s.icon}
        </div>
        <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 6, textAlign: "center", whiteSpace: "nowrap" }}>
          {label.replace(/_/g, " ")}
        </div>
      </div>
      {!isLast && (
        <div style={{ flex: 1, height: 2, background: status === "SUCCESS" ? "#166534" : "#1d2942", margin: "0 -2px 18px" }} />
      )}
    </div>
  );
}

export default function PipelineGraph({ flow }) {
  const stages = flow?.stages || [];

  return (
    <div style={{ background: "#0a0f1e", border: "1px solid #1d2942", borderRadius: 10, padding: "18px 20px" }}>
      <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Pipeline</div>
      <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4 }}>
        {STAGES.map((stageName, i) => {
          const match = stages.find((s) => s.name === stageName);
          return (
            <StageNode
              key={stageName}
              label={stageName}
              status={match ? match.status : "NONE"}
              isLast={i === STAGES.length - 1}
            />
          );
        })}
      </div>
    </div>
  );
}
