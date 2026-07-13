/*
 * Detects which RPC provider a chain is using from its URL, and returns that
 * provider's known usage limits. This lets the usage monitor apply the right
 * caps automatically instead of one hardcoded set of numbers for everyone.
 *
 * IMPORTANT — these limit numbers are what we've observed or what's publicly
 * documented, NOT pulled live from each provider's account. Treat them as
 * best-known defaults; update PROVIDER_PROFILES if your actual plan differs
 * (e.g. after upgrading a Dwellir or Alchemy tier).
 */

const PROVIDER_PROFILES = {

    alchemy: {
        label: "Alchemy",
        // From observed dashboard: 30M CU/mo, 500 CU/s peak (free tier).
        perSecond: { cap: 500, warnAt: 0.8, criticalAt: 0.95 },
        monthly: { cap: 30_000_000, warnAt: 0.8, criticalAt: 0.95 },
        methodCost: { eth_getLogs: 75, eth_blockNumber: 10, default: 20 },
        // Alchemy doesn't hard-block methods by plan the way Dwellir does —
        // failures show up as 429/CU errors, which the caps above cover.
        hardBlockedMethods: [],
        maxLogRange: 10, // no documented hard cap observed; keep conservative
    },

    dwellir: {
        label: "Dwellir",
        // We don't have a numeric CU cap from Dwellir — what we've confirmed
        // is a flat plan-tier method block on eth_getLogs for Base archive.
        // No % baseline applies to a hard block, so treat it as binary via
        // hardBlockedMethods instead of perSecond/monthly ratios.
        perSecond: null,
        monthly: null,
        methodCost: { eth_getLogs: 1, eth_blockNumber: 1, default: 1 },
        hardBlockedMethods: ["eth_getLogs"], // update once plan is upgraded
        maxLogRange: 10,
    },

    ankr: {
        label: "Ankr",
        perSecond: { cap: 30, warnAt: 0.8, criticalAt: 0.95 }, // public free tier is ~30 req/s; verify against your plan
        monthly: null,
        methodCost: { default: 1 },
        hardBlockedMethods: [],
        maxLogRange: 10,
    },

    quicknode: {
        label: "QuickNode",
        perSecond: null,
        monthly: { cap: 10_000_000, warnAt: 0.8, criticalAt: 0.95 }, // typical free-tier credits/mo; verify against your plan
        methodCost: { eth_getLogs: 20, default: 5 },
        hardBlockedMethods: [],
        // Confirmed via live error: "eth_getLogs is limited to a 5 range" on
        // the free Discover plan. Update if you upgrade tiers.
        maxLogRange: 5,
    },

    unknown: {
        label: "Unknown provider",
        perSecond: null,
        monthly: null,
        methodCost: { default: 1 },
        hardBlockedMethods: [],
        maxLogRange: 5, // unknown provider — assume the tightest common limit until proven otherwise
    }

};

const HOST_PATTERNS = [
    { pattern: /alchemy\.com|alchemyapi\.io/i, key: "alchemy" },
    { pattern: /dwellir\.com/i, key: "dwellir" },
    { pattern: /ankr\.com/i, key: "ankr" },
    { pattern: /quiknode\.pro|quicknode\.com/i, key: "quicknode" }
];

export function detectProvider(rpcUrl) {

    if (!rpcUrl) return "unknown";

    for (const { pattern, key } of HOST_PATTERNS) {
        if (pattern.test(rpcUrl)) return key;
    }

    return "unknown";

}

export function getProviderProfile(rpcUrl) {

    const key = detectProvider(rpcUrl);
    return { key, ...PROVIDER_PROFILES[key] };

}

export default { detectProvider, getProviderProfile };
