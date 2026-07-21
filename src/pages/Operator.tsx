

import { useEffect, useState } from "react";
import DashboardLayout from "../banking/components/DashboardLayout";

interface Node {
  node: string;
  type: string;
  status: string;
  metrics?: any;
  error?: string | null;
  lastSeen: string;
}

interface Runtime {
  uptime: number;
  pid: number;
  nodeVersion: string;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  cpu: { load: number[] };
  system: { hostname: string; platform: string; cpus: number };
}

interface ActionableData {
  activeIncidents: number;
  activeFlows: number;
  incidents: any[];
  recentActions: any[];
}

interface PredictionsData {
  stageStats: any;
  incidentClusters: any[];
  memoryStats: any;
  activeFlows: number;
  activeFlowIds: string[];
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function uptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

const STATUS_COLORS: Record<string, string> = {
  ONLINE: "#4ade80",
  WARNING: "#fbbf24",
  CRITICAL: "#ef4444",
  OFFLINE: "#6b7280",
  UNKNOWN: "#6b7280",
};

export default function Operator() {
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [actionable, setActionable] = useState<ActionableData | null>(null);
  const [predictions, setPredictions] = useState<PredictionsData | null>(null);
  const [swapOrders, setSwapOrders] = useState<any[]>([]);
  const [swapIntel, setSwapIntel] = useState<Record<string, any>>({});
  const [expandedSwap, setExpandedSwap] = useState<string | null>(null);
  const _swapState = useState<PredictionsData | null>(null);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"nodes" | "incidents" | "predictions">("nodes");
  const [pipelineDetails, setPipelineDetails] = useState<any>(null);
  const [loadingPipeline, setLoadingPipeline] = useState(false);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    try {
      // Runtime
      const rtRes = await fetch("/api/v1/operator/runtime", { credentials: "include" });
      if (rtRes.ok) {
        const rtData = await rtRes.json();
        if (rtData.success) setRuntime(rtData.data);
      }
    } catch (e) {}

    try {
      // Intelligence health (all nodes)
      const hRes = await fetch("/api/v1/intelligence/health", { credentials: "include" });
      if (hRes.ok) {
        const hData = await hRes.json();
        if (hData.success) setNodes(hData.data.nodes || []);
      }
    } catch (e) {}

    try {
      // Actionable incidents
      const aRes = await fetch("/api/v1/operator/actions/actionable", { credentials: "include" });
      if (aRes.ok) {
        const aData = await aRes.json();
        if (aData.success) setActionable(aData.data);
      }
    } catch (e) {}

    try {
      // Predictions
      const pRes = await fetch("/api/v1/operator/actions/predictions", { credentials: "include" });
      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData.success) setPredictions(pData.data);
      }
    } catch (e) {}
  }

  async function loadPipelineDetails() {
    setLoadingPipeline(true);
    try {
      const [predRes, flowsRes] = await Promise.all([
        fetch("/api/v1/operator/actions/predictions", { credentials: "include" }),
        fetch("/api/v1/intelligence/health", { credentials: "include" }),
      ]);
      const predData = await predRes.json();
      const flowsData = await flowsRes.json();
      const inspector = flowsData?.data?.nodes?.find((n: any) => n.node === "pipelineInspector");
      setPipelineDetails({
        predictions: predData?.data || null,
        inspectorMetrics: inspector?.metrics || null,
        status: inspector?.status || "UNKNOWN",
      });
    } catch (e) {
      console.error("Failed to load pipeline details", e);
    }
    setLoadingPipeline(false);
  }

  async function handleAction(action: string, body: any) {
    try {
      const res = await fetch(`/api/v1/operator/actions/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ${action} successful`);
        loadAll();
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (e: any) {
      alert(`❌ ${e.message}`);
    }
  }

  function getNodeDetail(node: Node) {
    switch (node.node) {
      case "pipelineInspector":
        return {
          title: "Pipeline Inspector",
          description: "Monitors all flows across every pipeline (PHP_DEPOSIT, FLOWER_SWAP, WITHDRAWAL). Tracks stages, detects deviations, and reports status.",
          metrics: node.metrics || {},
          warning: node.status === "WARNING"
            ? `⚠ ${node.metrics?.totalFlows || 0} total flows: ${node.metrics?.running || 0} running, ${node.metrics?.success || 0} succeeded, ${node.metrics?.failed || 0} failed — ${node.metrics?.failureRate || 0}% failure rate.`
            : null,
          action: node.status === "WARNING" ? "View Inspector" : null,
          actionLink: "/inspector",
          loadsDetails: true,
        };
      case "intelligenceCore":
        return {
          title: "Intelligence Core",
          description: "Orchestrates health checks across all system nodes. Collects metrics from every registered service.",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      case "mongodb":
        return {
          title: "MongoDB Database",
          description: "Primary data store. All flows, users, wallets, transactions, and audit records persist here.",
          metrics: node.metrics || {},
          warning: node.status !== "ONLINE" ? "⚠ Database connection issue — check Atlas or connection string." : null,
          action: null,
        };
      case "settlementWorker":
        return {
          title: "Settlement Worker",
          description: "Processes queued settlements — sends funds via Maya/Coins.ph, updates transaction status.",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      case "api":
        return {
          title: "API Server",
          description: "Express.js REST API serving the dashboard, webhooks, and all client requests.",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      case "LiveMemory":
        return {
          title: "Live Memory",
          description: "In-process state store caching active flows, events, decisions, and incidents for sub-millisecond access.",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      case "BrainBus":
        return {
          title: "BrainBus",
          description: "System-wide message bus. 27 channels, wildcard routing, connects every ISCAN component.",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      case "DecisionEngine":
        return {
          title: "Decision Engine",
          description: "Receives reasoning verdicts, classifies into AUTO/SUGGEST/ESCALATE/BLOCK tiers, dispatches actions.",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      case "ExplanationEngine":
        return {
          title: "Explanation Engine",
          description: "Generates human-readable explanations for every decision. Persists to MongoDB audit trail and broadcasts via SSE.",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      case "AnomalyDetector":
        return {
          title: "Anomaly Detector",
          description: "Tracks stage durations and failure rates. Flags slow stages (z-score > 2.5) and high failure rates (>30%).",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      case "CorrelationEngine":
        return {
          title: "Correlation Engine",
          description: "Groups related incidents by pipeline and error type in 5-minute windows. Identifies root causes.",
          metrics: node.metrics || {},
          warning: null,
          action: null,
        };
      default:
        return {
          title: node.node,
          description: `Type: ${node.type}. Status: ${node.status}.`,
          metrics: node.metrics || {},
          warning: node.error || null,
          action: null,
        };
    }
  }

  return (
    <DashboardLayout>
      <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        {/* ── Runtime Bar ─────────────────────────────────────────────── */}
        {runtime && (
          <div style={{
            background: "#111827", borderRadius: 8, padding: 12, marginBottom: 16,
            display: "flex", gap: 24, fontSize: 12, color: "#9ca3af", flexWrap: "wrap",
          }}>
            <span>⏱ Uptime: <b style={{ color: "#fff" }}>{uptime(runtime.uptime)}</b></span>
            <span>🖥 Host: <b style={{ color: "#fff" }}>{runtime.system?.hostname}</b></span>
            <span>📦 Node: <b style={{ color: "#fff" }}>{runtime.nodeVersion}</b></span>
            <span>🧠 Heap: <b style={{ color: "#fff" }}>{formatBytes(runtime.memory?.heapUsed)} / {formatBytes(runtime.memory?.heapTotal)}</b></span>
            <span>📊 CPU: <b style={{ color: "#fff" }}>{runtime.cpu?.load?.map((l: number) => l.toFixed(1)).join(" / ")}</b></span>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["nodes", "incidents", "predictions", "swaps"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                background: activeTab === tab ? "#00d4aa" : "#1f2937",
                color: activeTab === tab ? "#000" : "#d1d5db",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              {tab}
              {tab === "incidents" && actionable && (
                <span style={{ marginLeft: 6, background: "#ef4444", color: "#fff", padding: "2px 6px", borderRadius: 10, fontSize: 10 }}>
                  {actionable.activeIncidents}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── NODES TAB ───────────────────────────────────────────────── */}
        {activeTab === "nodes" && (
          <div>
            <h2 style={{ color: "#00d4aa", fontSize: 14, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              ⚙ System Nodes ({nodes.length})
            </h2>
            {nodes.map(node => {
              const detail = getNodeDetail(node);
              const isExpanded = expandedNode === node.node;
              return (
                <div key={node.node} style={{
                  background: "#111827",
                  borderRadius: 8,
                  marginBottom: 8,
                  border: isExpanded ? "1px solid #00d4aa" : "1px solid #1f2937",
                  overflow: "hidden",
                }}>
                  {/* ── Node header (clickable) ──────────────────────── */}
                  <div
                    onClick={() => {
                    const willExpand = !isExpanded;
                    setExpandedNode(willExpand ? node.node : null);
                    if (willExpand && detail.loadsDetails) {
                      loadPipelineDetails();
                    }
                  }}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#1a2236")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {detail.title}
                        {node.status === "WARNING" && <span style={{ marginLeft: 8, fontSize: 11, color: "#fbbf24" }}>⚠</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                        {node.type} · {timeAgo(node.lastSeen)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {detail.action && (
                        <a
                          href={detail.actionLink || "#"}
                          onClick={e => e.stopPropagation()}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 4,
                            background: "#fbbf24",
                            color: "#000",
                            fontSize: 11,
                            fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
                          {detail.action}
                        </a>
                      )}
                      <span style={{
                        color: STATUS_COLORS[node.status] || "#6b7280",
                        fontWeight: 700,
                        fontSize: 12,
                      }}>
                        ● {node.status}
                      </span>
                      <span style={{ color: "#6b7280", fontSize: 14 }}>
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* ── Expanded detail panel ──────────────────────────── */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px",
                      borderTop: "1px solid #1f2937",
                      background: "#0d1117",
                    }}>
                      <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>
                        {detail.description}
                      </p>

                      {detail.warning && (
                        <div style={{
                          background: "#78350f",
                          color: "#fbbf24",
                          padding: "8px 12px",
                          borderRadius: 6,
                          fontSize: 11,
                          marginBottom: 12,
                        }}>
                          {detail.warning}
                        </div>
                      )}

                      {detail.metrics && Object.keys(detail.metrics).length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>
                            Metrics
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            {Object.entries(detail.metrics).map(([key, val]: [string, any]) => (
                              <div key={key} style={{
                                background: "#111827",
                                padding: "6px 10px",
                                borderRadius: 4,
                                fontSize: 11,
                              }}>
                                <span style={{ color: "#6b7280" }}>{key}: </span>
                                <span style={{ color: "#e5e7eb", fontWeight: 600 }}>
                                  {typeof val === "object" ? JSON.stringify(val) : String(val)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {detail.loadsDetails && isExpanded && (
                    <div style={{ padding: "0 16px 12px", borderTop: "1px solid #1f2937" }}>
                      {loadingPipeline ? (
                        <div style={{ color: "#6b7280", fontSize: 11, padding: "8px 0" }}>Loading live data...</div>
                      ) : pipelineDetails ? (
                        <div>
                          {/* ── Flow summary ────────────────────────── */}
                          {pipelineDetails.inspectorMetrics && (
                            <div style={{
                              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8,
                              marginTop: 10, marginBottom: 10,
                            }}>
                              {[
                                { label: "Total Flows", val: pipelineDetails.inspectorMetrics.totalFlows, color: "#e5e7eb" },
                                { label: "Running", val: pipelineDetails.inspectorMetrics.running, color: "#60a5fa" },
                                { label: "Succeeded", val: pipelineDetails.inspectorMetrics.success, color: "#4ade80" },
                                { label: "Failed", val: pipelineDetails.inspectorMetrics.failed, color: "#ef4444" },
                              ].map(m => (
                                <div key={m.label} style={{
                                  background: "#0d1117", padding: "8px", borderRadius: 6, textAlign: "center",
                                }}>
                                  <div style={{ fontSize: 18, fontWeight: 700, color: m.color }}>{m.val}</div>
                                  <div style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>{m.label}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* ── Stage stats ──────────────────────────── */}
                          {pipelineDetails.predictions?.stageStats && Object.keys(pipelineDetails.predictions.stageStats).length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, textTransform: "uppercase" }}>
                                Stage Performance
                              </div>
                              {Object.entries(pipelineDetails.predictions.stageStats).slice(0, 6).map(([key, val]: [string, any]) => (
                                <div key={key} style={{
                                  display: "flex", justifyContent: "space-between", alignItems: "center",
                                  padding: "4px 8px", marginBottom: 2, borderRadius: 4,
                                  background: val.failureRate !== "0%" ? "#450a0a" : "#0d1117",
                                  fontSize: 10,
                                }}>
                                  <span style={{ color: "#e5e7eb", fontWeight: 600, flex: 2 }}>{key}</span>
                                  <span style={{ color: "#6b7280", flex: 1, textAlign: "center" }}>{val.avgDurationMs}ms avg</span>
                                  <span style={{ color: val.failureRate === "0%" ? "#4ade80" : "#ef4444", flex: 1, textAlign: "right", fontWeight: 700 }}>
                                    {val.failureRate}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* ── Suggestions ──────────────────────────── */}
                          {pipelineDetails.inspectorMetrics?.failed > 0 && (
                            <div style={{
                              background: "#78350f", color: "#fbbf24", padding: "8px 12px",
                              borderRadius: 6, fontSize: 10, marginTop: 10,
                            }}>
                              💡 <b>Suggestion:</b> {pipelineDetails.inspectorMetrics.failed} flow(s) failed. 
                              Click "View Inspector" to see which stages failed and retry or escalate. 
                              {pipelineDetails.inspectorMetrics.failureRate > 10 
                                ? " Failure rate above 10% — check for systemic issues (RPC health, treasury balance, gas)."
                                : ""}
                            </div>
                          )}

                          {pipelineDetails.inspectorMetrics?.running > 10 && (
                            <div style={{
                              background: "#1e3a5f", color: "#60a5fa", padding: "8px 12px",
                              borderRadius: 6, fontSize: 10, marginTop: 6,
                            }}>
                              ℹ {pipelineDetails.inspectorMetrics.running} flows currently running — 
                              {pipelineDetails.inspectorMetrics.running > 20 
                                ? " high volume, monitor for stalls."
                                : " normal load."}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: "#6b7280", fontSize: 10, padding: "8px 0" }}>
                          Click to load live pipeline data
                        </div>
                      )}
                    </div>
                  )}

                  {node.error && (
                        <div style={{
                          background: "#450a0a",
                          color: "#fca5a5",
                          padding: "8px 12px",
                          borderRadius: 6,
                          fontSize: 11,
                        }}>
                          Error: {node.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── INCIDENTS TAB ──────────────────────────────────────────── */}
        {activeTab === "incidents" && (
          <div>
            <h2 style={{ color: "#fbbf24", fontSize: 14, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              🚨 Active Incidents
            </h2>
            {actionable && actionable.incidents.length === 0 && (
              <div style={{ color: "#4ade80", fontSize: 12, padding: 20, textAlign: "center" }}>
                ✅ No active incidents
              </div>
            )}
            {actionable?.incidents.map((inc: any, i: number) => (
              <div key={i} style={{
                background: "#111827",
                borderRadius: 8,
                padding: 12,
                marginBottom: 8,
                border: "1px solid #1f2937",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#fbbf24" }}>
                      {inc.type || inc.code || "Unknown"}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                      {inc.diagnosis || inc.message}
                    </div>
                    {inc.flowId && (
                      <a href={`/inspector?flow=${inc.flowId}`} style={{ fontSize: 10, color: "#00d4aa", marginTop: 4, display: "inline-block" }}>
                        View flow → {inc.flowId}
                      </a>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => handleAction("resolve", { incidentId: inc.id || inc.flowId, resolution: "Resolved by operator" })}
                      style={{
                        padding: "4px 10px", borderRadius: 4, border: "none",
                        background: "#16a34a", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => handleAction("retry", { flowId: inc.flowId })}
                      style={{
                        padding: "4px 10px", borderRadius: 4, border: "none",
                        background: "#2563eb", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => handleAction("escalate", { flowId: inc.flowId, note: "Operator escalated" })}
                      style={{
                        padding: "4px 10px", borderRadius: 4, border: "none",
                        background: "#dc2626", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      Escalate
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PREDICTIONS TAB ─────────────────────────────────────────── */}
        {activeTab === "predictions" && (
          <div>
            <h2 style={{ color: "#a78bfa", fontSize: 14, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              🔮 Predictions & Correlation
            </h2>

            {predictions && (
              <>
                {/* Incident Clusters */}
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ color: "#e5e7eb", fontSize: 12, marginBottom: 8 }}>Incident Clusters</h3>
                  {predictions.incidentClusters.length === 0 && (
                    <div style={{ color: "#6b7280", fontSize: 11 }}>No clusters detected</div>
                  )}
                  {predictions.incidentClusters.map((c: any) => (
                    <div key={c.clusterId} style={{
                      background: "#111827", borderRadius: 6, padding: 10, marginBottom: 6,
                      border: "1px solid #1f2937", fontSize: 11,
                    }}>
                      <span style={{ color: "#fbbf24", fontWeight: 700 }}>{c.rootCause}</span>
                      <span style={{ color: "#6b7280", marginLeft: 8 }}>{c.pipeline}</span>
                      <span style={{ color: "#ef4444", marginLeft: 8 }}>{c.count} incidents</span>
                      <span style={{ color: "#6b7280", marginLeft: 8 }}>{timeAgo(c.firstSeen)} — {timeAgo(c.lastSeen)}</span>
                    </div>
                  ))}
                </div>

                {/* Stage Stats */}
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ color: "#e5e7eb", fontSize: 12, marginBottom: 8 }}>Stage Performance</h3>
                  {Object.entries(predictions.stageStats || {}).map(([key, val]: [string, any]) => (
                    <div key={key} style={{
                      background: "#111827", borderRadius: 6, padding: 8, marginBottom: 4,
                      display: "flex", justifyContent: "space-between", fontSize: 10,
                      border: val.failureRate !== "0%" ? "1px solid #78350f" : "1px solid #1f2937",
                    }}>
                      <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{key}</span>
                      <span style={{ color: "#6b7280" }}>avg {val.avgDurationMs}ms</span>
                      <span style={{ color: val.failureRate === "0%" ? "#4ade80" : "#ef4444" }}>{val.failureRate} fail</span>
                      <span style={{ color: "#6b7280" }}>{val.samples} samples</span>
                    </div>
                  ))}
                </div>

                {/* Memory Stats */}
                <div>
                  <h3 style={{ color: "#e5e7eb", fontSize: 12, marginBottom: 8 }}>Live Memory</h3>
                  <div style={{
                    background: "#111827", borderRadius: 6, padding: 10, fontSize: 10, color: "#9ca3af",
                    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6,
                  }}>
                    {Object.entries(predictions.memoryStats || {}).map(([key, val]) => (
                      <div key={key}>
                        <span style={{ color: "#6b7280" }}>{key}: </span>
                        <span style={{ color: "#e5e7eb" }}>{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Refresh button ──────────────────────────────────────────── */}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <button
            onClick={loadAll}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "none",
              background: "#00d4aa", color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}
          >
            🔄 Refresh All

        {/* ── SWAPS TAB ────────────────────────────────────────────── */}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
