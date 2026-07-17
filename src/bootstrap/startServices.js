import operatorSubscriber from "../services/operator/operatorSubscriber.js";

export function startServices() {
    operatorSubscriber.start();

    // depositScanner.start();
    // flowerWatcher.start();
    // healthMonitor.start();
}
