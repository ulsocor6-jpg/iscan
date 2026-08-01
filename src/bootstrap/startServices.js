import { startBlockchainObserver } from "../services/compliance/BlockchainObserver.js";
import { startOperationCorrelator } from "../services/compliance/OperationCorrelator.js";
import { startComplianceInspector } from "../services/compliance/ComplianceInspector.js";
import { startRiskScoreConsumer } from "../services/compliance/RiskScoreConsumer.js";
import operatorSubscriber from "../services/operator/operatorSubscriber.js";
import consensusService from '../services/consensusService.js';
import { resumeActiveWatches } from "../intelligence/laptop/mexcWatcher.js";
import architectureBootstrap from "../intelligence/architecture/architectureBootstrap.js";
import clientHealthMonitor from "../intelligence/clientHealth/clientHealthMonitor.js";




export function startServices() {
    operatorSubscriber.start();
    startBlockchainObserver();
    startOperationCorrelator();
    startComplianceInspector();
    startRiskScoreConsumer();
    resumeActiveWatches(); // event-driven — only polls MEXC while a sweep intent is actually pending

    clientHealthMonitor.start();

    // architectureBootstrap.start() scans and imports every file under src/
    // to discover .descriptor exports — not awaited so it never blocks boot,
    // failures are logged rather than crashing startup.
    architectureBootstrap.start().catch(err => {
        console.error("[Architecture] Failed to start:", err);
    });

    // depositScanner.start();
    // flowerWatcher.start();
    // healthMonitor.start();
}
console.log('[Consensus] Service started');
