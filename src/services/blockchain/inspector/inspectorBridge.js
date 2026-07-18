import inspector from "./blockchainInspector.js";
import eventStreamService from "../../eventStreamService.js";

/**
 * Bridges the blockchain engine's live in-memory Inspector (an EventEmitter,
 * no persistence, no UI) into the existing eventStreamService — the same
 * pipe that already feeds the System Inspector page (SSE + Mongo history).
 *
 * This means every inspector.info/success/warn/error() call anywhere in the
 * blockchain pipeline (collector, confirmation worker, deposit processor,
 * wallet credit worker, etc.) now shows up live in System Inspector under
 * the "blockchain.*" event type prefix, with no new frontend needed.
 *
 * Import this once, anywhere early in the boot sequence (bootstrap.js is
 * the natural place) — it just needs to run once to attach the listener.
 */
// Maps each Inspector "stage" (really: the class/module name that logged it)
// to a transaction category, so the frontend can split Deposits vs
// Withdrawals vs Scans vs System without guessing from stage name string.
// Add new entries here as new workers come online (e.g. a withdrawal worker).
const STAGE_CATEGORY = {
  BlockchainEngine: "scan",
  DepositProcessor: "deposit",
  ConfirmationWorker: "deposit",
  WalletCreditWorker: "deposit",
  LedgerWorker: "deposit",
  RecoveryWorker: "system",
  TreasurySendService: "withdrawal",
  swap: "swap",
  withdrawal: "withdrawal",
  "php-settlement": "swap",
};

inspector.on("event", (evt) => {
  eventStreamService
    .emit(`blockchain.${evt.stage}`, {
      level: evt.level,
      message: evt.message,
      category: STAGE_CATEGORY[evt.stage] || "other",
      ...evt.metadata,
    })
    .catch((err) => {
      // Never let a logging failure break the blockchain pipeline itself
      console.error("[InspectorBridge] Failed to forward event:", err.message);
    });
});

console.log("[InspectorBridge] Blockchain Inspector wired to System Inspector.");
