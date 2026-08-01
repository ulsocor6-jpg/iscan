#!/usr/bin/env python3
"""
Patch 8 — closes out the 3 remaining wiring gaps from the pipeline-status
review, plus one correction discovered in the process.

1. src/intelligence/platform/platformIntelligenceBus.js
   The descriptor said "Only confirmed caller is treasuryCoordinator.js" —
   that's now stale. operatorSubscriber.js already routes every
   blockchainInspector event through this bus (confirmed in source, with
   its own explanatory comment). Corrects previous[] and notes to match
   reality.

2. src/services/operator/diagnosisEngine.js
   diagnosisEngine.js exports a rich descriptor-shaped object as its
   default export, but architectureLoader looks for `mod.default.descriptor`
   specifically (a nested property), and the existing object's
   `type: "diagnostic_engine"` isn't a valid ComponentTypes entry anyway.
   Adds a proper `.descriptor` so it finally gets registered.

3. src/services/operator/incidentEngine.js
   Instruments the diagnose() call so diagnosisEngine shows up in
   lastSeen data too, not just as a registered-but-never-observed node.

4. app.js
   Mounts the already-fully-built (but never mounted) activityRoutes at
   /api/v1/admin/architecture's sibling path, same auth pattern
   (requireAuth + requireAdmin) as the other admin-only routes.

All-or-nothing across all 4 files.

Run from the repo root:
    python3 08_close_remaining_gaps.py
"""
import sys

PATCHES = [
    (
        "src/intelligence/platform/platformIntelligenceBus.js",
        '''    previous: ["treasuryCoordinator"],
    next: ["intelligenceEventFactory"],
    dependsOn: ["intelligenceEventFactory", "eventGraphService", "correlationEngine", "activityEngine", "treasuryIntelligenceBus", "incidentEngine"],
    criticality: "HIGH",
    notes: "Only confirmed caller is treasuryCoordinator.js — non-treasury sources do not yet publish to this bus."''',
        '''    previous: ["treasuryCoordinator", "operatorSubscriber"],
    next: ["intelligenceEventFactory"],
    dependsOn: ["intelligenceEventFactory", "eventGraphService", "correlationEngine", "activityEngine", "treasuryIntelligenceBus", "incidentEngine"],
    criticality: "HIGH",
    notes: "Confirmed live callers: treasuryCoordinator.js (stage: 'treasury', on every pool recalculation) and operatorSubscriber.js (every blockchainInspector event, all stages). Non-treasury events flow through the bus's normalize/graph/correlate/record steps but skip the bus's only registered handler (treasury-stage-only) and go straight to incidentEngine.process()."''',
    ),
    (
        "src/services/operator/diagnosisEngine.js",
        '''  notificationPolicy: {
    warning: ["Dashboard"],
    critical: ["Incident Engine"]
  },
  criticality: "CRITICAL"
};

import knowledgeBase from "./knowledgeBase.js";''',
        '''  notificationPolicy: {
    warning: ["Dashboard"],
    critical: ["Incident Engine"]
  },
  criticality: "CRITICAL"
};

// architectureLoader looks for mod.default.descriptor specifically — the
// object above IS the default export but doesn't have a nested .descriptor
// of its own, so it was never picked up. type is corrected here too:
// "diagnostic_engine" above is not a registered ComponentTypes entry.
diagnosisEngine.descriptor = {
    id: "diagnosisEngine",
    name: diagnosisEngine.name,
    type: "engine",
    domain: diagnosisEngine.domain,
    description: diagnosisEngine.description,
    previous: ["incidentEngine"],
    next: [],
    dependsOn: diagnosisEngine.dependsOn,
    criticality: diagnosisEngine.criticality
};

import knowledgeBase from "./knowledgeBase.js";''',
    ),
    (
        "src/services/operator/incidentEngine.js",
        '''import { diagnose } from "./diagnosisEngine.js";''',
        '''import { diagnose } from "./diagnosisEngine.js";
import architectureEventBridge from "../../intelligence/architecture/architectureEventBridge.js";''',
    ),
    (
        "src/services/operator/incidentEngine.js",
        '''  // Process an operational event into an incident
  process(event) {
    const diagnosis = diagnose(event);
    if (!diagnosis) return null;''',
        '''  // Process an operational event into an incident
  process(event) {
    architectureEventBridge.started("diagnosisEngine");
    const diagnosis = diagnose(event);
    architectureEventBridge.completed("diagnosisEngine");
    if (!diagnosis) return null;''',
    ),
    (
        "app.js",
        '''app.use("/api/v1/intelligence", intelligenceRoutes);
app.use("/api/v1/admin/architecture", requireAuth, requireAdmin, architectureRoutes);''',
        '''app.use("/api/v1/intelligence", intelligenceRoutes);
app.use("/api/v1/admin/architecture", requireAuth, requireAdmin, architectureRoutes);
app.use("/api/v1/admin/activity", requireAuth, requireAdmin, activityRoutes);''',
    ),
]


def main():
    file_cache = {}
    for path, old, _new in PATCHES:
        if path not in file_cache:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    file_cache[path] = f.read()
            except FileNotFoundError:
                print(f"ABORT: file not found: {path}")
                sys.exit(1)

        count = file_cache[path].count(old)
        if count != 1:
            print(f"ABORT: expected exactly 1 occurrence of anchor in {path}, found {count}")
            print("No files have been modified.")
            sys.exit(1)

    for path, old, new in PATCHES:
        file_cache[path] = file_cache[path].replace(old, new)

    for path, content in file_cache.items():
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"OK: patched {path}")


if __name__ == "__main__":
    main()
