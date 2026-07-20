export const Channels = {
    PHP_DEPOSIT_RECEIVED:       "php.deposit.received",
    PHP_DEPOSIT_MATCHED:        "php.deposit.matched",
    PHP_DEPOSIT_FAILED:         "php.deposit.failed",
    BLOCKCHAIN_EVENT:           "blockchain.event",
    BLOCKCHAIN_EVENT_CONFIRMED: "blockchain.event.confirmed",
    BLOCKCHAIN_EVENT_FAILED:    "blockchain.event.failed",
    INSPECTOR_FLOW_STARTED:     "inspector.flow.started",
    INSPECTOR_FLOW_STAGE:       "inspector.flow.stage",
    INSPECTOR_FLOW_COMPLETED:   "inspector.flow.completed",
    INSPECTOR_FLOW_DEVIATION:   "inspector.flow.deviation",
    MEMORY_SNAPSHOT:            "memory.snapshot",
    MEMORY_QUERY:               "memory.query",
    KNOWLEDGE_LOOKUP:           "knowledge.lookup",
    KNOWLEDGE_RULE_MATCHED:     "knowledge.rule.matched",
    REASONING_VERDICT:          "reasoning.verdict",
    DECISION_DISPATCHED:        "decision.dispatched",
    DECISION_EXECUTED:          "decision.executed",
    DECISION_FAILED:            "decision.failed",
    OPERATOR_INCIDENT:          "operator.incident",
    OPERATOR_REMEDIATION:       "operator.remediation",
    ACTION_EXECUTED:            "action.executed",
    ACTION_FAILED:              "action.failed",
    EXPLANATION_GENERATED:      "explanation.generated",
    SYSTEM_HEALTH:              "system.health",
    SYSTEM_ERROR:               "system.error"
};

export const channelName = (channel) => {
    for (const [key, val] of Object.entries(Channels)) {
        if (val === channel) return key;
    }
    return channel;
};
