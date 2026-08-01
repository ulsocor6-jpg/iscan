// src/services/securityPostureService.js
//
// Confirms — continuously, not just at the moment someone reads the code —
// that critical routes still have the auth middleware they're supposed to,
// and surfaces any runtime deprecation/security warnings (e.g. the Mongoose
// `new: true` warning we just fixed) as a visible node in the Operator
// dashboard instead of something that only shows up if someone happens to
// be watching the terminal.
//
// Reports to the same healthRegistry every other watcher reports to, so it
// shows up in Operator → Nodes exactly like recoveryWorker, blockchainEngine,
// etc. — no new dashboard plumbing needed.

import healthRegistry from "../intelligence/healthRegistry.js";

const CHECK_INTERVAL_MS = 60000; // re-verify every 60s

// Routes that must never be reachable without auth. Add to this list
// whenever a new admin/debug/internal route is introduced — this is the
// one place that should catch "someone forgot the middleware" before an
// operator does.
const PROTECTED_ROUTES = [
    { method: "get", path: "/api/debug/brainbus-dump", requiredMiddleware: ["requireAuth", "requireAdmin"] },
];

let recentWarnings = [];
const WARNING_RETENTION_MS = 10 * 60 * 1000; // keep a warning "visible" for 10 min after it fires

function checkRouteAuth(app) {
    const issues = [];

    for (const route of PROTECTED_ROUTES) {
        const layer = (app.router || app._router)?.stack.find(
            (l) => l.route && l.route.path === route.path && l.route.methods[route.method]
        );

        if (!layer) {
            issues.push(`${route.path} not found in route stack (route removed or renamed?)`);
            continue;
        }

        const middlewareNames = layer.route.stack.map((s) => s.name || s.handle?.name);
        const missing = route.requiredMiddleware.filter((m) => !middlewareNames.includes(m));

        if (missing.length > 0) {
            issues.push(`${route.path} is missing: ${missing.join(", ")}`);
        }
    }

    return issues;
}

function pruneOldWarnings() {
    const cutoff = Date.now() - WARNING_RETENTION_MS;
    recentWarnings = recentWarnings.filter((w) => w.at.getTime() > cutoff);
}

function runCheck(app) {
    pruneOldWarnings();

    const routeIssues = checkRouteAuth(app);
    const hasWarnings = recentWarnings.length > 0;
    const hasRouteIssues = routeIssues.length > 0;

    let status = "ONLINE";
    if (hasRouteIssues) status = "CRITICAL"; // an unauthenticated admin/debug route is not a warning-level issue
    else if (hasWarnings) status = "WARNING";

    healthRegistry.report({
        node: "securityPosture",
        status,
        metrics: {
            protectedRoutesChecked: PROTECTED_ROUTES.length,
            routeIssues,
            recentRuntimeWarnings: recentWarnings.map((w) => ({ name: w.name, message: w.message, at: w.at })),
            lastCheckedAt: new Date(),
        },
        error: hasRouteIssues ? routeIssues.join("; ") : null,
    });
}

function start(app) {
    healthRegistry.registerNode({ node: "securityPosture", type: "watcher" });

    // Catches Node/Mongoose deprecation warnings (like the `new: true` one)
    // at the moment they fire, rather than only when someone happens to be
    // watching stdout. This is intentionally generic — it'll also flag any
    // *future* deprecation warning, not just the ones we already fixed.
    process.on("warning", (warning) => {
        recentWarnings.push({ name: warning.name, message: warning.message, at: new Date() });
        console.warn("[securityPostureService] Runtime warning captured:", warning.name, warning.message);
    });

    runCheck(app);

    setInterval(() => {
        try {
            runCheck(app);
        } catch (err) {
            console.error("[securityPostureService]", err.message);
            healthRegistry.report({ node: "securityPosture", status: "WARNING", error: err.message });
        }
    }, CHECK_INTERVAL_MS);

    console.log("[securityPostureService] Started — checking route auth + runtime warnings every 60s.");
}

export default { start, runCheck, PROTECTED_ROUTES };
