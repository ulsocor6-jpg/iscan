#!/usr/bin/env python3
"""
Patch 8b — corrected version of patch 8. Only the app.js anchor changed;
platformIntelligenceBus.js / diagnosisEngine.js / incidentEngine.js are
identical to patch 8 (those anchors already matched successfully — patch 8
aborted on app.js specifically, before writing ANYTHING, so none of the 4
files were actually touched by that run despite what got committed
afterward).

Run from the repo root:
    python3 08b_close_remaining_gaps_fixed.py
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
        '''app.use("/api/v1/node", nodeRoutes);
app.use("/api/v1/admin/architecture", requireAuth, requireAdmin, architectureRoutes);''',
        '''app.use("/api/v1/node", nodeRoutes);
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
