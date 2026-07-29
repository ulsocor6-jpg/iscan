import { startBlockchainObserver } from "../services/compliance/BlockchainObserver.js";
import { startOperationCorrelator } from "../services/compliance/OperationCorrelator.js";
import { startComplianceInspector } from "../services/compliance/ComplianceInspector.js";
import { startRiskScoreConsumer } from "../services/compliance/RiskScoreConsumer.js";
import operatorSubscriber from "../services/operator/operatorSubscriber.js";
import consensusService from '../services/consensusService.js';




export function startServices() {
    operatorSubscriber.start();
    startBlockchainObserver();
    startOperationCorrelator();
    startComplianceInspector();
    startRiskScoreConsumer();

    // depositScanner.start();
    // flowerWatcher.start();
    // healthMonitor.start();
}
console.log('[Consensus] Service started');
