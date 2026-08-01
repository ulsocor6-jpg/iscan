import React, { useState, useEffect } from 'react';

const operatorTree = {
  id: 'operator',
  label: 'Operator Service',
  purpose: 'Orchestrates all autonomous decisions – getRuntime(), restart(), getWorkers()',
  status: 'online',
  children: [
    {
      id: 'intelligence',
      label: 'Intelligence Core',
      purpose: 'Continuous health monitoring, reporting & snapshot collection',
      status: 'online',
      children: [
        { id: 'reasoning', label: 'Reasoning Engine', purpose: 'analyzeFlow() – pinpoints the exact failed stage & stall detection', status: 'idle' },
        { id: 'rootcause', label: 'Root Cause Classifier', purpose: 'classifyError() – maps raw errors to predefined root causes', status: 'idle' },
        { id: 'systemknowledge', label: 'System Knowledge', purpose: 'getPipeline(), getExpectedStages() – defines every flow sequence', status: 'online' },
        { id: 'healthregistry', label: 'Health Registry', purpose: 'getOverallStatus() – aggregates node health (green/yellow/red)', status: 'online' },
        { id: 'stagetimeline', label: 'Stage Timeline', purpose: 'buildStageTimeline() – visual progress per flow', status: 'idle' }
      ]
    },
    {
      id: 'brainbus',
      label: 'Brain Bus',
      purpose: 'Event backbone – emit(), on(), once(), dump()',
      status: 'online',
      children: [
        { id: 'decision', label: 'Decision Engine', purpose: 'Auto‑remediate or escalate based on tier', status: 'idle' },
        { id: 'explanation', label: 'Explanation Engine', purpose: '_buildExplanation() – human‑readable failure summaries', status: 'idle' },
        { id: 'livememory', label: 'Live Memory', purpose: 'Short‑term event buffer for correlation', status: 'online' },
        {
          id: 'predictions',
          label: 'Predictions',
          purpose: 'Proactive anomaly detection & correlation',
          status: 'idle',
          children: [
            { id: 'anomaly', label: 'Anomaly Detector', purpose: 'Statistical deviation checks on stage durations & failure rates', status: 'idle' },
            { id: 'correlation', label: 'Correlation Engine', purpose: 'Groups incidents into clusters (cascading failure detection)', status: 'idle' },
            { id: 'opactions', label: 'Operator Actions', purpose: 'resolveIncident(), retryFlow(), escalateFlow()', status: 'idle' },
            { id: 'swapbridge', label: 'Swap Flow Bridge', purpose: 'Syncs external swap states into Live Memory', status: 'idle' }
          ]
        }
      ]
    },
    {
      id: 'emitters',
      label: 'External Emitters',
      purpose: 'All emitters are now event‑driven – zero constant polling',
      status: 'online',
      children: [
        { id: 'deposits', label: 'Deposits (PHP / Direct)', purpose: '🔔 Listens to: deposit.created, deposit.matched, deposit.flagged', status: 'idle' },
        { id: 'transactions', label: 'Transactions', purpose: '🔔 Listens to: transaction.started, transaction.settled, transaction.failed', status: 'idle' },
        { id: 'wallets', label: 'Wallets', purpose: '🔔 Listens to: wallet.generated', status: 'idle' },
        { id: 'compliance', label: 'Compliance', purpose: '🔔 Listens to: COMPLIANCE_TRANSACTION, COMPLIANCE_RISK_SCORE, COMPLIANCE_CORRELATED', status: 'idle' },
        { id: 'sweeps', label: 'Treasury Sweeps', purpose: '🔔 Listens to: treasury.sweep.started, treasury.sweep.completed', status: 'idle' }
      ]
    },
    {
      id: 'watchers',
      label: 'Watchers & RPC Polling',
      purpose: 'All watchers are now event‑driven — no constant polling',
      status: 'online',
      children: [
        { id: 'baseCollector', label: 'Base Collector', purpose: 'Event‑driven – wakes on deposit/withdrawal/swap', status: 'idle', note: 'Was constant RPC' },
        { id: 'blockchainEngine', label: 'Blockchain Engine', purpose: 'Event‑driven – wakes on deposit/withdrawal/swap', status: 'idle', note: 'Was constant RPC' },
        { id: 'recoveryWorker', label: 'Recovery Worker', purpose: 'Event‑driven – wakes on deposit/withdrawal/swap', status: 'idle', note: 'Event‑driven' },
        { id: 'baseStableListener', label: 'Base Stablecoin Listener', purpose: 'Event‑driven – wakes on deposit.created / wallet.generated', status: 'idle', note: 'Was constant RPC' },
        { id: 'tronListener', label: 'Tron Listener', purpose: 'Event‑driven – wakes on deposit.created (USDT)', status: 'idle', note: 'Was constant RPC' },
        { id: 'walletbalance', label: 'Wallet Balance Sync', purpose: 'Periodic (5 min) – can be further event‑driven', status: 'idle', note: 'Low impact' },
        { id: 'treasuryBalancer', label: 'Treasury Balancer', purpose: 'Periodic (60s) – DB only', status: 'idle', note: 'DB only' },
        { id: 'withdrawalExpiry', label: 'Withdrawal Expiry', purpose: 'Periodic (30s) – DB only', status: 'idle', note: 'DB only' },
        { id: 'eventRetention', label: 'Event Retention', purpose: 'Hourly – DB only', status: 'idle', note: 'DB only' },
        { id: 'depositExpiry', label: 'Deposit Expiry', purpose: 'Periodic (60s) – DB only', status: 'idle', note: 'DB only' }
      ]
    }
  ]
};

const pipelineTree = {
  id: 'pipeline',
  label: 'Intelligence Pipeline',
  purpose: 'Event flow: Subsystem -> Platform Intelligence Bus -> Event Factory -> Execution Graph -> Correlation Engine -> Activity Engine -> Consensus/Variance -> Diagnosis -> Incident -> Mission Control',
  status: 'online',
  children: [
    { id: 'subsystem', label: 'Subsystem (source event)', purpose: 'Any component emitting an event — currently only TreasuryCoordinator publishes to this bus.', status: 'online' },
    { id: 'platformIntelligenceBus', label: 'Platform Intelligence Bus', purpose: 'Central publish pipeline — normalizes, graphs, correlates, records, dispatches.', status: 'idle' },
    { id: 'eventFactory', label: 'Event Factory', purpose: 'intelligenceEventFactory — normalizes raw events into a consistent shape.', status: 'idle' },
    { id: 'executionGraph', label: 'Execution Graph', purpose: 'eventGraphService / executionGraph — builds node+edge graph of event flow.', status: 'idle' },
    { id: 'correlationEngine', label: 'Correlation Engine', purpose: 'Groups related events into sessions.', status: 'idle' },
    { id: 'activityEngine', label: 'Activity Engine', purpose: 'Records every published event for activity feed / audit.', status: 'idle' },
    { id: 'consensusEngine', label: 'Consensus / Variance Detection', purpose: 'treasuryIntelligenceBus + varianceDetectionEngine — treasury-specific balance verification.', status: 'idle' },
    { id: 'diagnosisEngine', label: 'Diagnosis Engine', purpose: 'Matches events against the 35-rule knowledge base to classify root cause.', status: 'idle' },
    { id: 'incidentEngine', label: 'Incident Engine', purpose: 'Creates and tracks incidents from diagnoses.', status: 'idle' },
    { id: 'missionControl', label: 'Mission Control', purpose: 'missionControlAggregator — live system/activity/execution/components/timeline state.', status: 'idle' }
  ]
};

const triggerMap = {
  id: 'triggers',
  label: 'Trigger Map (Wake-Up Signals)',
  purpose: 'Click any node to see exactly which events wake it up',
  status: 'online',
  children: [
    { id: 't_deposits', label: 'Deposits', purpose: '🔔 deposit.created\n🔔 deposit.matched\n🔔 deposit.flagged', status: 'idle' },
    { id: 't_transactions', label: 'Transactions', purpose: '🔔 transaction.started\n🔔 transaction.settled\n🔔 transaction.failed', status: 'idle' },
    { id: 't_wallets', label: 'Wallets', purpose: '🔔 wallet.generated', status: 'idle' },
    { id: 't_compliance', label: 'Compliance', purpose: '🔔 COMPLIANCE_TRANSACTION\n🔔 COMPLIANCE_RISK_SCORE\n🔔 COMPLIANCE_CORRELATED', status: 'idle' },
    { id: 't_sweeps', label: 'Treasury Sweeps', purpose: '🔔 treasury.sweep.started\n🔔 treasury.sweep.completed', status: 'idle' },
    { id: 't_recovery', label: 'Recovery Worker', purpose: '🔔 deposit.created\n🔔 withdrawal.started\n🔔 swap.created', status: 'idle' },
    { id: 't_basecollector', label: 'Base Collector', purpose: '🔔 deposit.created\n🔔 withdrawal.started\n🔔 swap.created', status: 'idle' },
    { id: 't_blockchainengine', label: 'Blockchain Engine', purpose: '🔔 deposit.created\n🔔 withdrawal.started\n🔔 swap.created', status: 'idle' },
    { id: 't_stablelistener', label: 'Base Stablecoin Listener', purpose: '🔔 deposit.created\n🔔 wallet.generated', status: 'idle' },
    { id: 't_tronlistener', label: 'Tron Listener', purpose: '🔔 deposit.created (USDT)', status: 'idle' },
    { id: 't_walletbalance', label: 'Wallet Balance Sync', purpose: '🕐 Periodic (5 min)\nCan be triggered by: transaction.settled, treasury.sweep.completed', status: 'idle' },
    { id: 't_treasury', label: 'Treasury Balancer', purpose: '🕐 Periodic (60s)\nCan be triggered by: treasury.sweep.completed, operator.incident', status: 'idle' },
    { id: 't_withdrawalexpiry', label: 'Withdrawal Expiry', purpose: '🕐 Periodic (30s)\nCan be triggered by: withdrawal.started', status: 'idle' },
    { id: 't_depositexpiry', label: 'Deposit Expiry', purpose: '🕐 Periodic (60s)\nCan be triggered by: deposit.created', status: 'idle' },
    { id: 't_eventretention', label: 'Event Retention', purpose: '🕐 Hourly – acceptable', status: 'idle' }
  ]
};

const statusColors: Record<string, string> = {
  online: '#4caf50',
  idle: '#9e9e9e',
  offline: '#757575',
  active: '#2196f3',
  warning: '#ff9800',
  critical: '#f44336'
};

// Only nodes actually instrumented with healthRegistry reporting are mapped here.
// Everything else keeps its static placeholder status until it's wired up too.
const HEALTH_ID_MAP: Record<string, string> = {
  baseCollector: 'blockchainEngine',
  blockchainEngine: 'blockchainEngine',
  recoveryWorker: 'recoveryWorker',
  baseStableListener: 'baseStableListener',
  tronListener: 'tronListener',
  withdrawalExpiry: 'withdrawalExpiry',
  depositExpiry: 'depositExpiry',
  t_basecollector: 'blockchainEngine',
  t_blockchainengine: 'blockchainEngine',
  t_recovery: 'recoveryWorker',
  t_stablelistener: 'baseStableListener',
  t_tronlistener: 'tronListener',
  t_withdrawalexpiry: 'withdrawalExpiry',
  t_depositexpiry: 'depositExpiry',
};

function mapApiStatus(status: string): string {
  switch (status) {
    case 'ONLINE': return 'online';
    case 'WARNING': return 'warning';
    case 'CRITICAL': return 'critical';
    case 'OFFLINE': return 'offline';
    default: return 'idle';
  }
}

function mergeLiveStatus(node: any, healthByNode: Record<string, any>): any {
  const healthKey = HEALTH_ID_MAP[node.id];
  const health = healthKey ? healthByNode[healthKey] : null;
  const merged: any = {
    ...node,
    ...(health ? {
      status: mapApiStatus(health.status),
      liveError: health.error || null,
      lastSeen: health.lastSeen || null,
    } : {}),
  };
  if (node.children) {
    merged.children = node.children.map((child: any) => mergeLiveStatus(child, healthByNode));
  }
  return merged;
}

const TreeNode = ({ node, depth = 0 }: any) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    } else {
      alert(`${node.label}\n\n${node.purpose}${node.note ? '\n\n⚠ ' + node.note : ''}${node.liveError ? '\n\n🚨 ' + node.liveError : ''}`);
    }
  };

  return (
    <div style={{ marginLeft: depth * 20, fontFamily: 'monospace' }}>
      <div
        onClick={handleClick}
        title={`${node.label}\nStatus: ${node.status}\n\n${node.purpose}${node.note ? '\n⚠ ' + node.note : ''}${node.liveError ? '\n🚨 ' + node.liveError : ''}`}
        style={{
          cursor: 'pointer',
          padding: '5px 8px',
          margin: '2px 0',
          borderLeft: `4px solid ${statusColors[node.status] || '#888'}`,
          background: depth === 0 ? '#2a2a2a' : 'transparent',
          color: 'white',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <span style={{ fontWeight: 700 }}>{node.label}</span>
        <span style={{ color: statusColors[node.status], fontSize: '0.8em' }}>
          {node.status.toUpperCase()}
        </span>
        {hasChildren && (
          <span style={{ marginLeft: 'auto', fontSize: '0.8em' }}>
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && (
          <span style={{ marginLeft: 'auto', fontSize: '0.7em', color: '#888' }}>🔍 click</span>
        )}
      </div>
      {expanded && node.children?.map((child: any) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
};

const OperatorMap = () => {
  const [health, setHealth] = useState<Record<string, any>>({});
  const [pipelineComponents, setPipelineComponents] = useState<Record<string, any>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadHealth() {
      try {
        const res = await fetch('/api/v1/intelligence/health', { credentials: 'include' });
        const data = await res.json();
        if (!cancelled && data?.success) {
          const byNode: Record<string, any> = {};
          (data.data?.nodes || []).forEach((n: any) => { byNode[n.node] = n; });
          setHealth(byNode);
        }
      } catch (e) {
        // fetch failed — keep last known state rather than blanking the map
      }
    }
    async function loadPipeline() {
      try {
        const res = await fetch('/api/v1/mission-control', { credentials: 'include' });
        const data = await res.json();
        if (!cancelled && data?.components) {
          setPipelineComponents(data.components);
        }
      } catch (e) {
        // fetch failed — keep last known state rather than blanking the map
      }
    }
    loadHealth();
    loadPipeline();
    const interval = setInterval(() => { loadHealth(); loadPipeline(); }, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const liveOperatorTree = mergeLiveStatus(operatorTree, health);
  const liveTriggerMap = mergeLiveStatus(triggerMap, health);

  // Pipeline stages beyond "subsystem" are always-on plumbing — if the
  // subsystem stage fired recently, every stage after it in the chain ran
  // too (the bus calls them synchronously in sequence). Only "subsystem"
  // itself reflects a real per-source distinction (which stage published).
  const pipelineHasFired = Object.keys(pipelineComponents).length > 0;
  const livePipelineTree = {
    ...pipelineTree,
    children: pipelineTree.children.map((node: any) => {
      if (node.id === 'subsystem') {
        const firedStages = Object.keys(pipelineComponents);
        return {
          ...node,
          status: pipelineHasFired ? 'online' : 'idle',
          purpose: firedStages.length > 0
            ? `${node.purpose}\n\nActive sources: ${firedStages.join(', ')}`
            : node.purpose,
        };
      }
      return { ...node, status: pipelineHasFired ? 'online' : 'idle' };
    }),
  };

  return (
    <div style={{ padding: 20, color: 'white' }}>
      <h2>🧠 Intelligent Operator – Live Map</h2>
      <p style={{ color: '#aaa' }}>
        Click any arrow (▶) to expand/collapse • Click a leaf node (🔍) to see its triggers
      </p>
      <TreeNode node={liveOperatorTree} depth={0} />
      <TreeNode node={liveTriggerMap} depth={0} />
      <TreeNode node={livePipelineTree} depth={0} />
    </div>
  );
};

export default OperatorMap;
