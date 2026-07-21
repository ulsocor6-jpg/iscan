#!/usr/bin/env python3
"""
Patch: attach reasoningEngine output to each flow returned by getFlow/getFlows,
so the frontend can display real System-Knowledge-based reasoning instead of
the current frontend-only pendingExplanation() heuristics.

Idempotent — safe to re-run, skips anything already patched.
Run from repo root:  python3 patch_inspector_controller_reasoning.py
"""
import sys
from pathlib import Path

path = Path("src/controllers/admin/inspectorController.js")
if not path.exists():
    print(f"ABORT: {path} does not exist")
    sys.exit(1)

text = path.read_text()

marker = "reasoningEngine.analyzeFlow"
if marker in text:
    print("SKIP: already patched")
    sys.exit(0)

old = 'import InspectorFlow from "../../models/inspectorModel.js";'
new = '''import InspectorFlow from "../../models/inspectorModel.js";
import reasoningEngine from "../../intelligence/reasoningEngine.js";

// Mongoose documents need to become plain objects before we can attach
// a computed "reasoning" field that isn't part of the schema.
function withReasoning(flowDoc) {
    const flow = flowDoc.toObject ? flowDoc.toObject() : flowDoc;
    flow.reasoning = reasoningEngine.analyzeFlow(flow);
    return flow;
}'''

if text.count(old) != 1:
    print(f"ABORT: import anchor not found exactly once ({text.count(old)} matches)")
    sys.exit(1)
text = text.replace(old, new)

old_getflows = '''        const flows = await InspectorFlow
            .find()
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(flows);'''
new_getflows = '''        const flows = await InspectorFlow
            .find()
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(flows.map(withReasoning));'''

if text.count(old_getflows) != 1:
    print(f"ABORT: getFlows anchor not found exactly once ({text.count(old_getflows)} matches)")
    sys.exit(1)
text = text.replace(old_getflows, new_getflows)

old_getflow = '''        if (!flow) {

            return res.status(404).json({
                error: "Flow not found"
            });

        }

        res.json(flow);'''
new_getflow = '''        if (!flow) {

            return res.status(404).json({
                error: "Flow not found"
            });

        }

        res.json(withReasoning(flow));'''

if text.count(old_getflow) != 1:
    print(f"ABORT: getFlow anchor not found exactly once ({text.count(old_getflow)} matches)")
    sys.exit(1)
text = text.replace(old_getflow, new_getflow)

path.write_text(text)
print("OK: reasoning wired into getFlows and getFlow")
print("Review with: git --no-pager diff")
