import blockchainEngine from "../services/blockchain/collector/blockchainEngine.js";
import rpcUsageMonitor from "../services/blockchain/monitor/rpcUsageMonitor.js";

/**
 * GET /api/v1/admin/blockchain/polling
 * Current polling state for every registered chain — interval, bounds,
 * whether an admin override is active. Backing data for a polling-control
 * panel on the admin dashboard.
 */
export async function getPollingState(req, res) {
  try {
    const state = blockchainEngine.getAllPollingState();
    res.json({ success: true, count: state.length, chains: state });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/admin/blockchain/polling/:chain/override
 * Body: { ms: number, reason?: string }
 * Forces a fixed polling interval for one chain, bypassing adaptive
 * backoff until cleared. Use for known demand spikes or to manually
 * throttle a chain nearing a provider quota.
 */
export async function setPollingOverride(req, res) {
  try {
    const { chain } = req.params;
    const { ms, reason } = req.body;

    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
      return res.status(400).json({ success: false, error: "ms must be a positive number" });
    }

    blockchainEngine.setChainPollingOverride(chain, ms, { reason: reason ?? `admin:${req.user?.id ?? "unknown"}` });
    res.json({ success: true, state: blockchainEngine.getPollingState(chain) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * DELETE /api/v1/admin/blockchain/polling/:chain/override
 * Clears an admin override, resuming automatic adaptive polling for the chain.
 */
export async function clearPollingOverride(req, res) {
  try {
    const { chain } = req.params;
    blockchainEngine.clearChainPollingOverride(chain);
    res.json({ success: true, state: blockchainEngine.getPollingState(chain) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/admin/blockchain/polling/:chain/bounds
 * Body: { min?: number, max?: number }
 * Adjusts the adaptive min/max interval range itself (not a fixed override).
 * Default max is 2 minutes (2 min idle ceiling); this lets an admin raise
 * or lower that per chain without touching code.
 */
export async function setPollingBounds(req, res) {
  try {
    const { chain } = req.params;
    const { min, max } = req.body;

    if (min == null && max == null) {
      return res.status(400).json({ success: false, error: "Provide at least one of min or max" });
    }

    blockchainEngine.setChainPollingBounds(chain, { min, max });
    res.json({ success: true, state: blockchainEngine.getPollingState(chain) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/v1/admin/blockchain/usage
 * Per-chain RPC usage estimate vs. detected provider's known limits, plus
 * a projected quota-exhaustion date where the provider has a monthly cap.
 * This is an ESTIMATE based on local call tracking, not the provider's
 * real billing meter — see rpcUsageMonitor.js / providerRegistry.js.
 */
export async function getUsageSnapshot(req, res) {
  try {
    const snapshots = rpcUsageMonitor.snapshotAll();
    res.json({ success: true, count: snapshots.length, usage: snapshots });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
