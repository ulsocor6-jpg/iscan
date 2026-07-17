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

  createKey(event, diagnosis) {
    return [
      event.source,
      event.orderId,
      diagnosis.code
    ].join(":");
  }
}

export default new IncidentEngine();
