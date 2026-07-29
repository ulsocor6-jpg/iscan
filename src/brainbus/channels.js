// src/brainbus/channels.js
const Channels = {
  // Inspector flow events
  INSPECTOR_FLOW_STARTED: 'inspector.flow.started',
  INSPECTOR_FLOW_STAGE: 'inspector.flow.stage',
  INSPECTOR_FLOW_COMPLETED: 'inspector.flow.completed',
  INSPECTOR_FLOW_DEVIATION: 'inspector.flow.deviation',

  // Blockchain events
  BLOCKCHAIN_EVENT: 'blockchain.event',
  BLOCKCHAIN_EVENT_FAILED: 'blockchain.event.failed',
  COMPLIANCE_TRANSACTION: "compliance:transaction",
  COMPLIANCE_CORRELATED: "compliance:correlated",
  COMPLIANCE_RISK_SCORE: "compliance:riskScore",

  // Knowledge and reasoning
  KNOWLEDGE_LOOKUP: 'knowledge.lookup',
  KNOWLEDGE_RULE_MATCHED: 'knowledge.rule.matched',
  REASONING_VERDICT: 'reasoning.verdict',

  // Decisions and actions
  DECISION_DISPATCHED: 'decision.dispatched',
  DECISION_EXECUTED: 'decision.executed',
  DECISION_FAILED: 'decision.failed',
  ACTION_EXECUTED: 'action.executed',

  // Explanations
  EXPLANATION_GENERATED: 'explanation.generated',

  // Operator incidents
  OPERATOR_INCIDENT: 'operator.incident',

  // System health
  SYSTEM_HEALTH: 'system.health',

  // Memory snapshots
  MEMORY_SNAPSHOT: 'memory.snapshot',

  // Treasury Consensus V2
  DEPOSIT_VERIFIED: 'deposit.verified',
  TREASURY_DRIFT: 'treasury.drift',
  DEPOSIT_CREDITED: 'deposit.credited',

  // Session Intelligence
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_RISK: 'session.risk',
  SESSION_ANOMALY: 'session.anomaly',
  SESSION_TERMINATED: 'session.terminated',

};

export { Channels };
export default Channels;
