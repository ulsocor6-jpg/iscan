#!/usr/bin/env python3
"""
Patches src/services/blockchain/collector/blockchainEngine.js:

Two gaps in the existing (already-uncommitted) adaptive polling system:

1. BLOCK_CHUNK was a single global constant (10), applied to every chain
   regardless of provider. providerRegistry correctly DETECTS that a chain
   is on Quicknode (5-block eth_getLogs limit) vs Alchemy (10-block
   capable), but nothing used that detection to size the chunk per chain —
   so a Quicknode-backed chain kept requesting 10-block ranges and kept
   hitting -32615 every tick.

2. The hard-block detection regex only matched Dwellir-style "method not
   supported on this plan" errors. Quicknode's actual error — "eth_getLogs
   is limited to a 5 range, upgrade from discover plan..." — is a RANGE
   restriction, not a method block, and didn't match either branch. It fell
   through to a raw throw, so Quicknode-backed chains got no graceful
   backoff at all, just a repeated crash-and-retry every tick.

Fix: add a maxLogRange to each provider profile, read it per-chain from the
already-detected provider profile, and extend the plan-block regex to catch
range-limit wording too.

Run from your project root (~/Desktop/iscansystem):
    python3 patch_provider_aware_chunking.py
"""
import sys
from pathlib import Path

REGISTRY = Path("src/services/blockchain/config/providerRegistry.js")
ENGINE = Path("src/services/blockchain/collector/blockchainEngine.js")

# ---- providerRegistry.js: add maxLogRange per provider ----------------

OLD_ALCHEMY = """    alchemy: {
        label: "Alchemy",
        // From observed dashboard: 30M CU/mo, 500 CU/s peak (free tier).
        perSecond: { cap: 500, warnAt: 0.8, criticalAt: 0.95 },
        monthly: { cap: 30_000_000, warnAt: 0.8, criticalAt: 0.95 },
        methodCost: { eth_getLogs: 75, eth_blockNumber: 10, default: 20 },
        // Alchemy doesn't hard-block methods by plan the way Dwellir does —
        // failures show up as 429/CU errors, which the caps above cover.
        hardBlockedMethods: []
    },"""

NEW_ALCHEMY = """    alchemy: {
        label: "Alchemy",
        // From observed dashboard: 30M CU/mo, 500 CU/s peak (free tier).
        perSecond: { cap: 500, warnAt: 0.8, criticalAt: 0.95 },
        monthly: { cap: 30_000_000, warnAt: 0.8, criticalAt: 0.95 },
        methodCost: { eth_getLogs: 75, eth_blockNumber: 10, default: 20 },
        // Alchemy doesn't hard-block methods by plan the way Dwellir does —
        // failures show up as 429/CU errors, which the caps above cover.
        hardBlockedMethods: [],
        maxLogRange: 10, // no documented hard cap observed; keep conservative
    },"""

OLD_DWELLIR = """        methodCost: { eth_getLogs: 1, eth_blockNumber: 1, default: 1 },
        hardBlockedMethods: ["eth_getLogs"] // update once plan is upgraded
    },"""

NEW_DWELLIR = """        methodCost: { eth_getLogs: 1, eth_blockNumber: 1, default: 1 },
        hardBlockedMethods: ["eth_getLogs"], // update once plan is upgraded
        maxLogRange: 10,
    },"""

OLD_ANKR = """        methodCost: { default: 1 },
        hardBlockedMethods: []
    },

    quicknode: {"""

NEW_ANKR = """        methodCost: { default: 1 },
        hardBlockedMethods: [],
        maxLogRange: 10,
    },

    quicknode: {"""

OLD_QUICKNODE = """        perSecond: null,
        monthly: { cap: 10_000_000, warnAt: 0.8, criticalAt: 0.95 }, // typical free-tier credits/mo; verify against your plan
        methodCost: { eth_getLogs: 20, default: 5 },
        hardBlockedMethods: []
    },

    unknown: {"""

NEW_QUICKNODE = """        perSecond: null,
        monthly: { cap: 10_000_000, warnAt: 0.8, criticalAt: 0.95 }, // typical free-tier credits/mo; verify against your plan
        methodCost: { eth_getLogs: 20, default: 5 },
        hardBlockedMethods: [],
        // Confirmed via live error: "eth_getLogs is limited to a 5 range" on
        // the free Discover plan. Update if you upgrade tiers.
        maxLogRange: 5,
    },

    unknown: {"""

OLD_UNKNOWN = """    unknown: {
        label: "Unknown provider",
        perSecond: null,
        monthly: null,
        methodCost: { default: 1 },
        hardBlockedMethods: []
    }"""

NEW_UNKNOWN = """    unknown: {
        label: "Unknown provider",
        perSecond: null,
        monthly: null,
        methodCost: { default: 1 },
        hardBlockedMethods: [],
        maxLogRange: 5, // unknown provider — assume the tightest common limit until proven otherwise
    }"""

# ---- blockchainEngine.js: use provider-aware chunk size + broaden regex --

OLD_CHUNK_CONST = """const BLOCK_CHUNK = 10;
const MAX_CHUNKS_PER_TICK = 8;           // caps how many getLogs calls can fire back-to-back on catch-up"""

NEW_CHUNK_CONST = """const DEFAULT_BLOCK_CHUNK = 10;           // fallback if a provider profile doesn't specify maxLogRange
const MAX_CHUNKS_PER_TICK = 8;           // caps how many getLogs calls can fire back-to-back on catch-up"""

OLD_REGISTER_STATE = """        rpcUsageMonitor.registerChain(chain, rpc);

        this.chains.push({
            chain,
            network,
            provider: new ethers.JsonRpcProvider(rpc),
            contracts: validContracts
        });"""

NEW_REGISTER_STATE = """        rpcUsageMonitor.registerChain(chain, rpc);

        // Provider-aware chunk size — a chain on Quicknode's free tier gets
        // 5-block windows, one on Alchemy gets 10, etc. Without this, every
        // chain used the same global BLOCK_CHUNK regardless of what its
        // actual RPC provider allows per eth_getLogs call.
        const profile = getProviderProfile(rpc);
        const blockChunk = profile.maxLogRange ?? DEFAULT_BLOCK_CHUNK;

        this.chains.push({
            chain,
            network,
            provider: new ethers.JsonRpcProvider(rpc),
            contracts: validContracts,
            blockChunk
        });"""

OLD_IMPORT_RPC = 'import rpcUsageMonitor from "../monitor/rpcUsageMonitor.js";'
NEW_IMPORT_RPC = ('import rpcUsageMonitor from "../monitor/rpcUsageMonitor.js";\n'
                   'import { getProviderProfile } from "../config/providerRegistry.js";')

OLD_DESTRUCTURE = 'const { chain, network, provider, contracts } = chainConfig;'
NEW_DESTRUCTURE = 'const { chain, network, provider, contracts, blockChunk } = chainConfig;'

OLD_TO_CALC = 'const to = Math.min(from + BLOCK_CHUNK - 1, latest);'
NEW_TO_CALC = 'const to = Math.min(from + blockChunk - 1, latest);'

OLD_REGEX = 'const isPlanBlock = /does not support the .* method|upgrade to a paid plan/i.test(msg);'
NEW_REGEX = ('const isPlanBlock = /does not support the .* method|upgrade to a paid plan'
             '|limited to a \\d+ range|upgrade from .* plan/i.test(msg);')


REPLACEMENTS = [
    (REGISTRY, OLD_ALCHEMY, NEW_ALCHEMY, "providerRegistry: alchemy.maxLogRange"),
    (REGISTRY, OLD_DWELLIR, NEW_DWELLIR, "providerRegistry: dwellir.maxLogRange"),
    (REGISTRY, OLD_ANKR, NEW_ANKR, "providerRegistry: ankr.maxLogRange"),
    (REGISTRY, OLD_QUICKNODE, NEW_QUICKNODE, "providerRegistry: quicknode.maxLogRange"),
    (REGISTRY, OLD_UNKNOWN, NEW_UNKNOWN, "providerRegistry: unknown.maxLogRange"),
    (ENGINE, OLD_IMPORT_RPC, NEW_IMPORT_RPC, "engine: import getProviderProfile"),
    (ENGINE, OLD_CHUNK_CONST, NEW_CHUNK_CONST, "engine: DEFAULT_BLOCK_CHUNK rename"),
    (ENGINE, OLD_REGISTER_STATE, NEW_REGISTER_STATE, "engine: per-chain blockChunk from provider profile"),
    (ENGINE, OLD_DESTRUCTURE, NEW_DESTRUCTURE, "engine: destructure blockChunk"),
    (ENGINE, OLD_TO_CALC, NEW_TO_CALC, "engine: use per-chain blockChunk in range calc"),
    (ENGINE, OLD_REGEX, NEW_REGEX, "engine: broaden hard-block regex to catch range-limit errors"),
]


def main():
    touched = {}
    for target, old, new, label in REPLACEMENTS:
        if not target.exists():
            print(f"ERROR: {target} not found.")
            sys.exit(1)
        text = touched.get(target) or target.read_text(encoding="utf-8")
        if new in text:
            print(f"  [skip] {label} — already patched")
            touched[target] = text
            continue
        if old not in text:
            print(f"  [WARN] {label} — expected text not found")
            touched[target] = text
            continue
        touched[target] = text.replace(old, new)
        print(f"  [ok] {label}")

    for target, text in touched.items():
        original = target.read_text(encoding="utf-8")
        if text == original:
            continue
        backup = target.with_suffix(target.suffix + ".providerfix.bak")
        backup.write_text(original, encoding="utf-8")
        target.write_text(text, encoding="utf-8")
        print(f"Patched {target} (backup: {backup})")


if __name__ == "__main__":
    main()
