// src/services/operator/knowledge/workers.js

export default [

    {
        code: "QUEUE_STALLED",
        title: "Worker Queue Stalled",
        domain: "workers",
        component: "Job Queue",
        pipeline: "WORKERS",
        severity: "HIGH",
        confidence: 94,
        autoRemediation: false,
        playbook: "WORKER_RESTART",
        notification: ["dashboard"],
        affects: ["Background Jobs"],
        emits: ["incident.created", "worker.queue.stalled"],
        patterns: [
            "queue stalled",
            "job stalled",
            "worker stalled"
        ],
        recommendation:
            "Restart the affected worker and inspect the processing queue."
    }

];
