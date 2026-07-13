import inspector from "../inspector/blockchainInspector.js";
import { getProviderProfile } from "../config/providerRegistry.js";

/*
 * Provider-aware local usage estimator. Each chain's RPC URL is checked
 * against providerRegistry to find which known provider it's on, and that
 * provider's own caps/costs are used for threshold math — Alchemy and
 * Dwellir don't fail the same way, so they can't share one alert rule.
 *
 * Still an ESTIMATE — see providerRegistry.js for the caveat on where these
 * numbers came from.
 */

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

class RpcUsageMonitor {

    constructor() {
        this._chains = new Map(); // chain -> { profile, secondBucket, monthWindow, lastWarnLevel }
    }

    registerChain(chain, rpcUrl) {

        const profile = getProviderProfile(rpcUrl);

        this._chains.set(chain, {
            profile,
            secondBucket: { windowStart: Date.now(), units: 0 },
            monthWindow: { windowStart: Date.now(), units: 0 },
            lastWarnLevel: { perSecond: 0, monthly: 0 }
        });

        inspector.info(
            "RpcUsageMonitor",
            `Chain ${chain} detected as provider: ${profile.label}`,
            { chain, provider: profile.key }
        );

    }

    // Call this whenever a request to a hard-blocked method fails with a
    // plan/method-tier rejection (e.g. Dwellir's "does not support eth_getLogs"
    // 403). This is binary — no percentage applies.
    recordHardBlock(chain, method, errorMessage) {

        const state = this._chains.get(chain);
        const label = state?.profile?.label ?? chain;

        inspector.error(
            "RpcUsageMonitor",
            `${label}: ${method} is blocked on current plan`,
            { chain, method, errorMessage, provider: state?.profile?.key }
        );

    }

    record(chain, method, count = 1) {

        const state = this._chains.get(chain);
        if (!state) return; // chain never registered — nothing to compare against

        const { profile } = state;

        if (profile.hardBlockedMethods.includes(method)) {
            // Caller should really be using recordHardBlock() with the real
            // error, but guard here too in case a blocked method still fires.
            return;
        }

        const cost = (profile.methodCost[method] ?? profile.methodCost.default) * count;
        const now = Date.now();

        if (now - state.secondBucket.windowStart >= 1000) {
            state.secondBucket = { windowStart: now, units: 0 };
        }
        state.secondBucket.units += cost;

        if (now - state.monthWindow.windowStart >= MONTH_MS) {
            state.monthWindow = { windowStart: now, units: 0 };
            state.lastWarnLevel.monthly = 0;
        }
        state.monthWindow.units += cost;

        this._checkThreshold(chain, state, "perSecond", state.secondBucket.units);
        this._checkThreshold(chain, state, "monthly", state.monthWindow.units);

    }

    _checkThreshold(chain, state, kind, units) {

        const limitDef = state.profile[kind];
        if (!limitDef) return; // provider has no known cap for this window type

        const { cap, warnAt, criticalAt } = limitDef;
        const ratio = units / cap;
        const level = ratio >= criticalAt ? criticalAt : (ratio >= warnAt ? warnAt : 0);

        if (level === 0 || level <= state.lastWarnLevel[kind]) return;
        state.lastWarnLevel[kind] = level;

        const severity = level >= criticalAt ? "error" : "warn";
        const pct = Math.round(ratio * 100);

        inspector[severity](
            "RpcUsageMonitor",
            `${state.profile.label} ${chain}: ${kind === "perSecond" ? "per-second" : "monthly"} usage at ~${pct}% of estimated cap`,
            { chain, provider: state.profile.key, kind, estimatedUnits: units, cap, ratio, pct }
        );

    }

    estimateExhaustionDate(chain) {

        const state = this._chains.get(chain);
        if (!state?.profile.monthly) return null;

        const elapsedMs = Date.now() - state.monthWindow.windowStart;
        if (elapsedMs < 60 * 60 * 1000) return null; // <1h of data, too noisy

        const ratePerMs = state.monthWindow.units / elapsedMs;
        if (ratePerMs <= 0) return null;

        const remainingUnits = state.profile.monthly.cap - state.monthWindow.units;
        if (remainingUnits <= 0) return new Date();

        return new Date(Date.now() + remainingUnits / ratePerMs);

    }

    snapshot(chain) {

        const state = this._chains.get(chain);
        if (!state) return null;

        return {
            chain,
            provider: state.profile.label,
            perSecond: state.profile.perSecond
                ? { units: state.secondBucket.units, cap: state.profile.perSecond.cap }
                : null,
            monthly: state.profile.monthly
                ? { units: state.monthWindow.units, cap: state.profile.monthly.cap }
                : null,
            estimatedExhaustion: this.estimateExhaustionDate(chain)
        };

    }

    snapshotAll() {
        return [...this._chains.keys()].map(chain => this.snapshot(chain));
    }

}

export default new RpcUsageMonitor();
