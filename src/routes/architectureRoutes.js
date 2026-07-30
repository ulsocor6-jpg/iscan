import express from "express";

import architectureReasoningEngine from "../intelligence/architecture/architectureReasoningEngine.js";
import runtimeArchitectureObserver from "../intelligence/architecture/runtimeArchitectureObserver.js";
import architectureKnowledgeGraph from "../intelligence/architecture/architectureKnowledgeGraph.js";

const router = express.Router();

// GET /api/v1/admin/architecture/pipeline-status
router.get("/pipeline-status", (req, res) => {

    const nodes = architectureKnowledgeGraph.list();

    const pipeline = nodes.map(node => {

        const analysis =
            architectureReasoningEngine.analyze(node.id);

        const lastSeen =
            runtimeArchitectureObserver.lastSeen(node.id);

        return {
            id: node.id,
            name: node.name,
            type: node.type,
            criticality: node.criticality,
            notes: node.notes || null,
            wired: {
                previous: node.previous || [],
                next: node.next || []
            },
            currentlyRunning: runtimeArchitectureObserver.active.has(node.id),
            lastSeen,
            runtime: analysis
        };

    });

    res.json({
        generatedAt: new Date().toISOString(),
        nodeCount: nodes.length,
        currentlyActive: [...runtimeArchitectureObserver.active.keys()],
        pipeline
    });

});

// GET /api/v1/admin/architecture/knowledge-graph
router.get("/knowledge-graph", (req, res) => {

    res.json({
        nodeCount: architectureKnowledgeGraph.list().length,
        nodes: architectureKnowledgeGraph.list(),
        validationErrors: architectureKnowledgeGraph.validate()
    });

});

export default router;
