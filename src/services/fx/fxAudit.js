export function logFxEvent(event) {
  console.log("[FX AUDIT]", {
    ...event,
    timestamp: Date.now()
  });

  // in production → write to MongoDB / Kafka
}
