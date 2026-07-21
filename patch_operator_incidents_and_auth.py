#!/usr/bin/env python3
"""
Patch:
1. Extend incidentEngine.js with list(), listOpen(), get(id), acknowledge(id)
   — the controller already calls these but they never existed on the live
   Map-based engine (only getOpen()/resolve(key) did).
2. Fix resolveIncident in operatorController.js to resolve by id instead of
   the ambiguous code+source pair (matches acknowledgeIncident's pattern).
3. Wire /incidents, /incidents/open, /incidents/:id, /incidents/:id/acknowledge,
   /incidents/:id/resolve into operatorRoutes.js.
4. Apply requireAuth + requireAdmin to the entire operator router — this
   closes the gap where /restart was previously unauthenticated.

Run from repo root:  python3 patch_operator_incidents_and_auth.py
"""
import sys
from pathlib import Path

def patch(path, old, new, label, already_marker):
    p = Path(path)
    if not p.exists():
        print(f"ABORT: {path} does not exist")
        sys.exit(1)
    text = p.read_text()
    if already_marker in text:
        print(f"  skip (already patched): {label}")
        return
    count = text.count(old)
    if count == 0:
        print(f"ABORT: anchor not found in {path} — {label}")
        print("----- expected anchor -----")
        print(repr(old))
        sys.exit(1)
    if count > 1:
        print(f"ABORT: anchor matched {count} times (expected 1) in {path} — {label}")
        sys.exit(1)
    p.write_text(text.replace(old, new))
    print(f"OK: {label}")


# ---------------------------------------------------------------------------
# 1. incidentEngine.js — add list/listOpen/get/acknowledge
# ---------------------------------------------------------------------------
IE = "src/services/operator/incidentEngine.js"

patch(IE,
    '''  getOpen() {
    return [...this.activeIncidents.values()];
  }''',
    '''  getOpen() {
    return [...this.activeIncidents.values()];
  }

  // Alias kept for API-shape compatibility with the controller.
  listOpen() {
    return this.getOpen();
  }

  // No separate resolved-history store exists in memory (resolved
  // incidents are deleted from activeIncidents on resolve() — full
  // history lives in Mongo via inspectorBridge/eventStreamService).
  // For now this just returns the open set; a real history view should
  // query eventStreamService's persisted "operator.incident" events.
  list() {
    return this.getOpen();
  }

  get(id) {
    return [...this.activeIncidents.values()].find(i => i.id === id) || null;
  }

  acknowledge(id) {
    const incident = [...this.activeIncidents.values()].find(i => i.id === id);
    if (!incident) return null;
    incident.status = "ACKNOWLEDGED";
    incident.acknowledgedAt = new Date();
    return incident;
  }

  // Resolve by id — unambiguous, unlike code+source which multiple open
  // incidents could share across different orders.
  resolveById(id) {
    const incident = [...this.activeIncidents.entries()].find(([, v]) => v.id === id);
    if (!incident) return null;
    const [key] = incident;
    return this.resolve(key) ? this.get(id) || { id, status: "RESOLVED" } : null;
  }''',
    "add list/listOpen/get/acknowledge/resolveById to incidentEngine",
    "resolveById(id) {"
)


# ---------------------------------------------------------------------------
# 2. operatorController.js — fix resolveIncident to use id, not code+source
# ---------------------------------------------------------------------------
OC = "src/controllers/operatorController.js"

patch(OC,
    '''export async function resolveIncident(req, res) {

    try {

        const {

            code,

            source

        } = req.body;

        const result =
            incidentEngine.resolve(
                code,
                source
            );

        if (!result) {''',
    '''export async function resolveIncident(req, res) {

    try {

        const result =
            incidentEngine.resolveById(
                req.params.id
            );

        if (!result) {''',
    "fix resolveIncident to resolve by id",
    "incidentEngine.resolveById(\n                req.params.id"
)


# ---------------------------------------------------------------------------
# 3. operatorRoutes.js — add incident routes + lock down with requireAuth/requireAdmin
# ---------------------------------------------------------------------------
OR = "src/routes/operator/operatorRoutes.js"

patch(OR,
    '''import express from "express";

import {
    runtime,
    workers,
    restart
}
from "../../controllers/operatorController.js";


const router = express.Router();



router.get(
    "/runtime",
    runtime
);



router.get(
    "/workers",
    workers
);



router.post(
    "/restart",
    restart
);



export default router;''',
    '''import express from "express";

import {
    runtime,
    workers,
    restart,
    incidents,
    openIncidents,
    incident,
    acknowledgeIncident,
    resolveIncident
}
from "../../controllers/operatorController.js";
import { requireAuth, requireAdmin } from "../../middleware/authMiddleware.js";


const router = express.Router();

// Every route below is operator-console-only — admin auth required.
router.use(requireAuth, requireAdmin);



router.get(
    "/runtime",
    runtime
);



router.get(
    "/workers",
    workers
);



router.post(
    "/restart",
    restart
);



router.get(
    "/incidents",
    incidents
);



router.get(
    "/incidents/open",
    openIncidents
);



router.get(
    "/incidents/:id",
    incident
);



router.post(
    "/incidents/:id/acknowledge",
    acknowledgeIncident
);



router.post(
    "/incidents/:id/resolve",
    resolveIncident
);



export default router;''',
    "add incident routes + requireAuth/requireAdmin lockdown",
    "router.use(requireAuth, requireAdmin);"
)

print("\nAll done. Next: node --check each file, then git --no-pager diff.")
print("IMPORTANT: this locks /api/v1/operator/* behind admin auth. Confirm")
print("Operator.tsx / MissionControl.tsx are only ever loaded on an")
print("authenticated admin session before testing (they are, per App.tsx's")
print("/admin/operator route using RequireAdmin) — but verify in the browser")
print("that the operator page still loads correctly after this change.")
