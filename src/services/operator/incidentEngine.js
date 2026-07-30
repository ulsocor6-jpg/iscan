// src/services/operator/incidentEngine.js

import { diagnose } from "./diagnosisEngine.js";

class IncidentEngine {
  constructor() {
    // In-memory registry
    this.incidents = [];
  }

  // Process an operational event into an incident
  process(event) {
    const diagnosis = diagnose(event);
    if (!diagnosis) return null;

    // Check for duplicates (same code + source + unresolved)
    const existing = this.incidents.find(
      i => i.code === diagnosis.code &&
           i.source === event.stage &&
           i.status !== "RESOLVED"
    );
    if (existing) return null; // deduplicate

    const incident = {
      diagnosis: diagnosis.message || diagnosis.title || diagnosis.code,
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      code: diagnosis.code,
      title: diagnosis.title,
      diagnosis: diagnosis.message || diagnosis.title,
      severity: diagnosis.severity,
      recommendation: diagnosis.recommendation,
      source: event.stage,
      orderId: event.metadata?.orderId,
      currency: event.metadata?.currency,
      resource: event.metadata?.resource,
      status: "OPEN",
      created: new Date().toISOString(),
      createdAt: new Date(),

      acknowledged: null,
      resolved: null,
      playbook: diagnosis.playbook,
      autoRemediation: diagnosis.autoRemediation === true,
      metadata: event.metadata || {}
    };

    this.incidents.push(incident);
    return incident;
  }

  resolve(code, source) {
    const idx = this.incidents.findIndex(
      i => i.code === code && i.source === source && i.status !== "RESOLVED"
    );
    if (idx === -1) return null;
    this.incidents[idx].status = "RESOLVED";
    this.incidents[idx].resolved = new Date().toISOString();
    return this.incidents[idx];
  }

  acknowledge(id) {
    const inc = this.incidents.find(i => i.id === id);
    if (!inc) return null;
    inc.status = "ACKNOWLEDGED";
    inc.acknowledged = new Date().toISOString();
    return inc;
  }

  list() {
    return [...this.incidents];
  }

  listOpen() {
    return this.incidents.filter(i => i.status === "OPEN");
  }

  get(id) {
    return this.incidents.find(i => i.id === id) || null;
  }
}

// Attach descriptor for documentation and introspection
IncidentEngine.descriptor = {
  id: "incidentEngine",
  name: "Incident Engine",
  domain: "intelligence",
  type: "engine",
  owner: "Platform Intelligence",
  previous: ["platformIntelligenceBus", "treasuryIntelligenceBus"],
  next: [],
  description:
    "Transforms diagnoses into managed operational incidents and tracks their lifecycle until resolution.",
  purpose: [
    "Create Incidents",
    "Deduplicate Incidents",
    "Manage Incident Lifecycle",
    "Track Active Incidents",
    "Provide Incident State"
  ],
  lifecycle: {
    startup: "Initializes in-memory active incident registry.",
    runtime:
      "Receives diagnoses, creates incidents, prevents duplicates and manages acknowledgements and resolution.",
    shutdown: "Graceful shutdown."
  },
  dependsOn: ["diagnosisEngine"],
  provides: [
    "Incident Registry",
    "Incident IDs",
    "Incident Lifecycle",
    "Active Incident List"
  ],
  consumedBy: [
    "Mission Control",
    "Telegram",
    "Dashboard",
    "Operator",
    "Inspector"
  ],
  inputs: ["Inspector Events", "Diagnosis Results"],
  outputs: ["OPEN", "ACKNOWLEDGED", "RESOLVED"],
  healthChecks: [
    "Incident Creation",
    "Duplicate Detection",
    "Registry Integrity"
  ],
  metrics: [
    "Open Incidents",
    "Resolved Incidents",
    "Acknowledged Incidents",
    "Duplicate Incidents Prevented"
  ],
  failureModes: [
    "Duplicate Incident Creation",
    "Registry Corruption",
    "Missing Diagnosis",
    "Lifecycle Failure"
  ],
  recovery: {
    automatic: ["Reject Duplicate Incidents"],
    manual: [
      "Review Active Incident Registry",
      "Verify Diagnosis Engine"
    ]
  },
  notificationPolicy: {
    warning: ["Dashboard"],
    critical: ["Telegram", "Dashboard"]
  },
  criticality: "CRITICAL"
};

// Singleton export
export default new IncidentEngine();
