// src/services/operator/knowledge/database.js

export default [

    {
        code: "DATABASE",
        title: "Database Failure",
        domain: "database",
        component: "MongoDB",
        pipeline: "DATABASE",
        severity: "CRITICAL",
        confidence: 96,
        autoRemediation: false,
        playbook: "MANUAL_INVESTIGATION",
        notification: ["telegram", "dashboard", "mission-control"],
        affects: ["Entire Platform"],
        emits: ["incident.created", "database.failure"],
        patterns: [
            "mongoose",
            "mongodb",
            "e11000",
            "buffering timed out"
        ],
        recommendation:
            "Inspect MongoDB connectivity and database health."
    }

];
