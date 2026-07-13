import { ethers } from "ethers";

import BlockchainCursor from "../../../models/blockchain/blockchainCursorModel.js";

import decoderRegistry from "../decoder/decoderRegistry.js";
import addressFilter from "../filter/addressFilter.js";
import activeDepositSessions from "../watch/activeDepositSessions.js";

import { record } from "../journal/blockchainInbox.js";
import inspector from "../inspector/blockchainInspector.js";
import rpcUsageMonitor from "../monitor/rpcUsageMonitor.js";
import { getProviderProfile } from "../config/providerRegistry.js";

const POLL_INTERVAL = 15000; // was 1000ms — that meant a getBlockNumber() call every second per chain, forever, even when idle. 15s is still fast enough for deposit monitoring and cuts polling-overhead RPC usage by ~15x.              // base tick — cheap, just checks chain timers

const DEFAULT_MIN_CHAIN_INTERVAL = 40000;    // fastest we'll hit a chain's RPC under real demand
const DEFAULT_MAX_CHAIN_INTERVAL = 120000;   // slowest backoff when idle — 2 min max, per demand-based policy
const BACKOFF_MULTIPLIER = 2;

const MIN_ALLOWED_INTERVAL = 1000;       // safety floor — admin can't force sub-1s polling by accident

const DEFAULT_BLOCK_CHUNK = 10;           // fallback if a provider profile doesn't specify maxLogRange
const MAX_CHUNKS_PER_TICK = 8;           // caps how many getLogs calls can fire back-to-back on catch-up
const CACHE_TTL_MS = 60000;

const IDLE_CHAIN_INTERVAL = 12 * 60 * 60 * 1000; // 12h — no active deposit session on this chain
const IDLE_BLOCK_CHUNK = 1;                        // minimal scan range while idle

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

class BlockchainEngine {

    constructor() {

        this.chains = [];

        this.running = false;
        this._polling = false;
        this._recentRanges = new Map();

        this._chainState = new Map();

    }

    register({ chain, network, rpc, contracts = [] }) {

        const validContracts = contracts
            .filter(Boolean)
            .map(c => c.trim().toLowerCase());

        if (!rpc) {
            throw new Error(`[BlockchainEngine] Missing RPC for ${chain}`);
        }

        if (validContracts.length === 0) {
            throw new Error(`[BlockchainEngine] No contracts configured for ${chain}`);
        }

        inspector.info(
            "BlockchainEngine",
            `Registered chain: ${chain}`,
            { chain, network, contracts: validContracts }
        );

        rpcUsageMonitor.registerChain(chain, rpc);

        const profile = getProviderProfile(rpc);
        const blockChunk = profile.maxLogRange ?? DEFAULT_BLOCK_CHUNK;

        this.chains.push({
            chain,
            network,
            provider: new ethers.JsonRpcProvider(rpc),
            contracts: validContracts,
            blockChunk
        });

        this._chainState.set(chain, {
            nextPollAt: 0,
            currentInterval: DEFAULT_MIN_CHAIN_INTERVAL,
            minInterval: DEFAULT_MIN_CHAIN_INTERVAL,
            maxInterval: DEFAULT_MAX_CHAIN_INTERVAL,
            overrideInterval: null
        });

    }

    setChainPollingOverride(chain, ms, { reason } = {}) {

        const state = this._requireChainState(chain);

        const clamped = Math.max(ms, MIN_ALLOWED_INTERVAL);
        if (clamped !== ms) {
            inspector.warn(
                "BlockchainEngine",
                `Admin override for ${chain} requested ${ms}ms, clamped to floor ${MIN_ALLOWED_INTERVAL}ms`,
                { chain, requested: ms, applied: clamped }
            );
        }

        state.overrideInterval = clamped;

        inspector.warn(
            "BlockchainEngine",
            `Admin override active: ${chain} polling forced to ${clamped}ms`,
            { chain, ms: clamped, reason: reason ?? null }
        );

    }

    clearChainPollingOverride(chain) {

        const state = this._requireChainState(chain);
        state.overrideInterval = null;

        inspector.info(
            "BlockchainEngine",
            `Admin override cleared for ${chain}, resuming adaptive polling`,
            { chain, minInterval: state.minInterval, maxInterval: state.maxInterval }
        );

    }

    setChainPollingBounds(chain, { min, max } = {}) {

        const state = this._requireChainState(chain);

        if (min != null) state.minInterval = Math.max(min, MIN_ALLOWED_INTERVAL);
        if (max != null) state.maxInterval = Math.max(max, state.minInterval);

        state.currentInterval = Math.min(Math.max(state.currentInterval, state.minInterval), state.maxInterval);

        inspector.info(
            "BlockchainEngine",
            `Admin updated polling bounds for ${chain}`,
            { chain, minInterval: state.minInterval, maxInterval: state.maxInterval }
        );

    }

    getPollingState(chain) {

        const state = this._chainState.get(chain);
        if (!state) return null;

        return {
            chain,
            currentInterval: state.currentInterval,
            minInterval: state.minInterval,
            maxInterval: state.maxInterval,
            overrideInterval: state.overrideInterval,
            nextPollAt: state.nextPollAt,
            mode: state.overrideInterval != null ? "admin_override" : "adaptive"
        };

    }

    getAllPollingState() {
        return [...this._chainState.keys()].map(chain => this.getPollingState(chain));
    }

    _requireChainState(chain) {
        const state = this._chainState.get(chain);
        if (!state) throw new Error(`[BlockchainEngine] Unknown chain: ${chain}`);
        return state;
    }

    start() {

        if (this.running) return;

        this.running = true;

        inspector.info(
            "BlockchainEngine",
            "Engine started",
            { chains: this.chains.map(c => c.chain), tickMs: POLL_INTERVAL }
        );

        setInterval(() => {
            if (this._polling) return;
            this._polling = true;
            this.poll()
                .catch((err) => {
                    console.error(err);
                    inspector.error("BlockchainEngine", err.message, { stack: err.stack });
                })
                .finally(() => { this._polling = false; });
        }, POLL_INTERVAL);

        setInterval(() => {
            for (const snapshot of rpcUsageMonitor.snapshotAll()) {
                inspector.info(
                    "BlockchainEngine",
                    snapshot.estimatedExhaustion
                        ? `${snapshot.provider} ${snapshot.chain}: estimated quota exhaustion ${snapshot.estimatedExhaustion.toISOString()}`
                        : `${snapshot.provider} ${snapshot.chain}: exhaustion estimate — insufficient data yet or no known monthly cap`,
                    snapshot
                );
            }
        }, 24 * 60 * 60 * 1000);

    }

    async poll() {

        const now = Date.now();

        for (const chain of this.chains) {

            const state = this._chainState.get(chain.chain);

            if (now < state.nextPollAt) continue;

            await this.pollChain(chain, state);

        }

    }

    _scheduleNext(state) {
        const interval = state.overrideInterval ?? state.currentInterval;
        state.nextPollAt = Date.now() + interval;
    }

    async pollChain(chainConfig, state) {

        const { chain, network, provider, contracts, blockChunk } = chainConfig;

        const hasActiveSession = activeDepositSessions.isActive(chain);
        const effectiveBlockChunk = hasActiveSession ? blockChunk : IDLE_BLOCK_CHUNK;
        const effectiveMinInterval = hasActiveSession ? state.minInterval : IDLE_CHAIN_INTERVAL;
        const effectiveMaxInterval = hasActiveSession ? state.maxInterval : IDLE_CHAIN_INTERVAL;

        const watchedAddresses = addressFilter.getWatchedAddresses();

        if (watchedAddresses.length === 0) {
            this._scheduleNext(state);
            return;
        }

        const watchedTopics = watchedAddresses.map(
            addr => ethers.zeroPadValue(addr, 32)
        );

        let cursor = await BlockchainCursor.findOne({ chain, network });

        if (!cursor) {

            const latest = await provider.getBlockNumber();
            rpcUsageMonitor.record(chain, "eth_blockNumber");

            cursor = await BlockchainCursor.create({
                chain,
                network,
                collector: "BlockchainEngine",
                lastScannedBlock: latest
            });

            inspector.info(
                "BlockchainEngine",
                `Cursor initialized`,
                { chain, network, startBlock: latest }
            );

            return;

        }

        const latest = await provider.getBlockNumber();
        rpcUsageMonitor.record(chain, "eth_blockNumber");

        if (latest <= cursor.lastScannedBlock) {

            cursor.lastHeartbeat = new Date();
            await cursor.save();

            if (state.overrideInterval == null) {
                state.currentInterval = Math.min(
                    state.currentInterval * BACKOFF_MULTIPLIER,
                    effectiveMaxInterval
                );
            }
            this._scheduleNext(state);

            return;

        }

        if (state.overrideInterval == null) {
            state.currentInterval = effectiveMinInterval;
        }

        let from = cursor.lastScannedBlock + 1;
        let chunksThisTick = 0;

        while (from <= latest && chunksThisTick < MAX_CHUNKS_PER_TICK) {

            const to = Math.min(from + effectiveBlockChunk - 1, latest);

            if (!contracts.length) {
                inspector.warn("BlockchainEngine", "No contracts configured", { chain });
                this._scheduleNext(state);
                return;
            }

            const rangeKey = `${chain}:${from}:${to}`;
            const cachedAt = this._recentRanges.get(rangeKey);
            if (cachedAt && (Date.now() - cachedAt) < CACHE_TTL_MS) {
                cursor.lastScannedBlock = to;
                cursor.lastHeartbeat = new Date();
                await cursor.save();
                from = to + 1;
                chunksThisTick++;
                continue;
            }
            this._recentRanges.set(rangeKey, Date.now());

            let logs;
            try {
                logs = await provider.getLogs({
                    address: contracts,
                    topics: [TRANSFER_TOPIC, null, watchedTopics],
                    fromBlock: from,
                    toBlock: to
                });
                rpcUsageMonitor.record(chain, "eth_getLogs");
            } catch (err) {
                const msg = err?.info?.responseBody || err?.shortMessage || err?.message || "";
                const isPlanBlock = /does not support the .* method|upgrade to a paid plan|limited to a \d+ range|upgrade from .* plan/i.test(msg);

                if (isPlanBlock) {
                    rpcUsageMonitor.recordHardBlock(chain, "eth_getLogs", msg);
                    state.nextPollAt = Date.now() + Math.max(effectiveMaxInterval, state.overrideInterval ?? 0);
                    return;
                }

                throw err;
            }

            let decoded = 0;
            let watched = 0;
            let recorded = 0;

            for (const log of logs) {

                const event = await decoderRegistry.decode(log, chain);
                if (!event) continue;
                decoded++;

                const watch = addressFilter.match(event.to);
                if (!watch) continue;
                watched++;

                event.watch = watch;
                await record(event);
                recorded++;

                inspector.success(
                    "BlockchainEngine",
                    `Watched transfer detected`,
                    { chain, token: event.token, to: event.to, value: event.value, txHash: event.txHash }
                );

            }

            if (logs.length > 0) {
                inspector.info(
                    "BlockchainEngine",
                    `Scanned ${chain} ${from}-${to}: ${logs.length} log(s), ${decoded} decoded, ${watched} watched`,
                    { chain, from, to, rpcLogs: logs.length, decoded, watched, recorded }
                );
            }

            cursor.lastScannedBlock = to;
            cursor.lastHeartbeat = new Date();
            cursor.totalBlocksScanned += (to - from + 1);
            cursor.totalEventsCollected += logs.length;

            await cursor.save();

            from = to + 1;
            chunksThisTick++;

            if (from <= latest && chunksThisTick < MAX_CHUNKS_PER_TICK) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }

        }

        this._scheduleNext(state);

    }

}

export default new BlockchainEngine();
