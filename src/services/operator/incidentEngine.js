// src/services/operator/incidentEngine.js

import { diagnose } from "./diagnosisEngine.js";

class IncidentEngine {
  constructor() {
    this.activeIncidents = new Map();
  }

  /**
   * Receive an inspector event.
   * Returns an Incident object only when action is required.
   */
  process(event) {
    // Ignore normal operations.
    // blockchainInspector emits level as "WARNING"/"ERROR" (uppercase) —
    // compare case-insensitively so this never silently discards
    // everything again if either side's casing changes.
    const level = String(event.level || "").toLowerCase();
    if (!["warn", "warning", "error"].includes(level)) {
      return null;
    }

    // Ask the diagnosis engine if this event matters
    const diagnosis = diagnose(event);

    if (!diagnosis) {
      return null;
    }

    const key = this.createKey(event, diagnosis);

    // Prevent duplicate incidents
    if (this.activeIncidents.has(key)) {
      return this.activeIncidents.get(key);
    }

    const incident = {
      id: crypto.randomUUID(),

      key,

      // blockchainInspector.log() never sets top-level source/orderId —
      // stage is the source, and orderId (like every other identifier)
      // lives inside metadata. Reading event.source/event.orderId
      // directly always produced undefined here.
      source: event.stage,
      orderId: event.metadata?.orderId,

      severity: diagnosis.severity,
      confidence: diagnosis.confidence,

      diagnosis: diagnosis.title,
      recommendation: diagnosis.recommendation,
      message: event.message,
      metadata: event.metadata || {},

      status: "OPEN",

      createdAt: new Date(),

      event
    };

    this.activeIncidents.set(key, incident);

    return incident;
  }

  resolve(key) {
    const incident = this.activeIncidents.get(key);

    if (!incident) return false;

    incident.status = "RESOLVED";
    incident.resolvedAt = new Date();

    this.activeIncidents.delete(key);

    return true;
  }

  getOpen() {
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
  }

  createKey(event, diagnosis) {
    // Raw inspector events only ever have {stage, metadata, ...} — never
    // top-level source/orderId. Using those (as this did before) meant
    // every incident with the same code collapsed into one shared key
    // regardless of which order/user it actually belonged to.
    return [
      event.stage,
      event.metadata?.orderId,
      diagnosis.code
    ].join(":");
  }
}

export default new IncidentEngine();
