#!/usr/bin/env python3
"""
Patch: display reasoningEngine's verdict/message in InternalInspector.jsx,
using the flow.reasoning field the backend now attaches.

Idempotent — safe to re-run, skips anything already patched.
Run from repo root:  python3 patch_internal_inspector_reasoning.py
"""
import sys
from pathlib import Path

path = Path("src/pages/technical/InternalInspector.jsx")
if not path.exists():
    print(f"ABORT: {path} does not exist")
    sys.exit(1)

text = path.read_text()

marker = "ReasoningPanel"
if marker in text:
    print("SKIP: already patched")
    sys.exit(0)

# 1. Add the ReasoningPanel component, right before FlowCard.
old_anchor = "function FlowCard({ flow }) {"
if text.count(old_anchor) != 1:
    print(f"ABORT: FlowCard anchor not found exactly once ({text.count(old_anchor)} matches)")
    sys.exit(1)

reasoning_component = '''const reasoningStyle = {
  COMPLETE:         { bg: "#14532d", color: "#4ade80", icon: "✓" },
  IN_PROGRESS:      { bg: "#1e3a5f", color: "#60a5fa", icon: "⟳" },
  TERMINATED:       { bg: "#1e293b", color: "#94a3b8", icon: "–" },
  FAILED_AT_STAGE:  { bg: "#7f1d1d", color: "#f87171", icon: "✗" },
  STALLED:          { bg: "#422006", color: "#fbbf24", icon: "⚠" },
  GAP_DETECTED:     { bg: "#422006", color: "#fbbf24", icon: "⚠" },
  UNKNOWN_PIPELINE: { bg: "#1e293b", color: "#64748b", icon: "?" },
  UNKNOWN:          { bg: "#1e293b", color: "#64748b", icon: "?" },
};

function ReasoningPanel({ reasoning }) {
  if (!reasoning) return null;
  const s = reasoningStyle[reasoning.verdict] || reasoningStyle.UNKNOWN;
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.color}44`, borderRadius: 8,
      padding: "10px 14px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span style={{ fontSize: 14, color: s.color }}>{s.icon}</span>
      <div>
        <div style={{ color: s.color, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>
          {reasoning.verdict.replace(/_/g, " ")}
        </div>
        <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.4 }}>
          {reasoning.message}
        </div>
      </div>
    </div>
  );
}

function FlowCard({ flow }) {'''

text = text.replace(old_anchor, reasoning_component)

# 2. Render it inside the expanded card, right before PipelineProgress.
old_render = "          {/* Pipeline progress — now clickable per-stage */}\n          <PipelineProgress flow={flow} />"
if text.count(old_render) != 1:
    print(f"ABORT: PipelineProgress render anchor not found exactly once ({text.count(old_render)} matches)")
    sys.exit(1)

new_render = "          {/* Reasoning verdict */}\n          <ReasoningPanel reasoning={flow.reasoning} />\n\n          {/* Pipeline progress — now clickable per-stage */}\n          <PipelineProgress flow={flow} />"

text = text.replace(old_render, new_render)

path.write_text(text)
print("OK: ReasoningPanel added and wired into FlowCard")
print("Review with: git --no-pager diff")
