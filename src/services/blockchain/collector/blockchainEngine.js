import { ethers } from "ethers";

import BlockchainCursor from "../../../models/blockchain/blockchainCursorModel.js";

import decoderRegistry from "../decoder/decoderRegistry.js";
import addressFilter from "../filter/addressFilter.js";

import { record } from "../journal/blockchainInbox.js";
import inspector from "../inspector/blockchainInspector.js";

const POLL_INTERVAL = 1000;

// Alchemy Free Tier
const BLOCK_CHUNK = 10;
const MAX_CHUNKS_PER_TICK = 20; // caps per-chain work per tick so no chain starves the others
const CACHE_TTL_MS = 60000; // recorder cache: skip re-scanning a range already handled this session

class BlockchainEngine {

    constructor() {

        this.chains = [];

        this.running = false;
        this._polling = false;
        this._recentRanges = new Map();

    }

    /*
    --------------------------------------------------------
    Register Chain
    --------------------------------------------------------
    */

    register({

        chain,
        network,
        rpc,
        contracts = []

    }) {

        const validContracts = contracts
            .filter(Boolean)
            .map(c => c.trim().toLowerCase());

        if (!rpc) {
            throw new Error(
                `[BlockchainEngine] Missing RPC for ${chain}`
            );
        }

        if (validContracts.length === 0) {
            throw new Error(
                `[BlockchainEngine] No contracts configured for ${chain}`
            );
        }

        console.log("");

        console.log("[REGISTER]");
        console.log({
            chain,
            network,
            rpc,
            contracts: validContracts
        });

        inspector.info(
            "BlockchainEngine",
            `Registered chain: ${chain}`,
            { chain, network, contracts: validContracts }
        );

        this.chains.push({

            chain,

            network,

            provider: new ethers.JsonRpcProvider(rpc),

            contracts: validContracts

        });

    }

    /*
    --------------------------------------------------------
    Start
    --------------------------------------------------------
    */

    start() {

        if (this.running) return;

        this.running = true;

        console.log(
            "[BlockchainEngine] Started."
        );

        inspector.info(
            "BlockchainEngine",
            "Engine started",
            { chains: this.chains.map(c => c.chain), pollIntervalMs: POLL_INTERVAL }
        );

        setInterval(() => {
            if (this._polling) return;
            this._polling = true;
            this.poll()
                .catch((err) => {
                    console.error(err);
                    inspector.error(
                        "BlockchainEngine",
                        err.message,
                        { stack: err.stack }
                    );
                })
                .finally(() => { this._polling = false; });
        }, POLL_INTERVAL);

    }

    /*
    --------------------------------------------------------
    Poll Every Chain
    --------------------------------------------------------
    */

    async poll() {

        for (const chain of this.chains) {

            await this.pollChain(chain);

        }

    }

    /*
    --------------------------------------------------------
    Poll One Chain
    --------------------------------------------------------
    */

    async pollChain(chainConfig) {

        const {

            chain,
            network,
            provider,
            contracts

        } = chainConfig;

        let cursor =
            await BlockchainCursor.findOne({

                chain,
                network

            });

        if (!cursor) {

            const latest =
                await provider.getBlockNumber();

            cursor =
                await BlockchainCursor.create({

                    chain,

                    network,

                    collector:
                        "BlockchainEngine",

                    lastScannedBlock:
                        latest

                });

            console.log(
                `[${chain}] Cursor initialized at ${latest}`
            );

            inspector.info(
                "BlockchainEngine",
                `Cursor initialized`,
                { chain, network, startBlock: latest }
            );

            return;

        }

        const latest =
            await provider.getBlockNumber();

        if (latest <= cursor.lastScannedBlock) {

            cursor.lastHeartbeat =
                new Date();

            await cursor.save();

            return;

        }

        let from =
            cursor.lastScannedBlock + 1;

        let chunksThisTick = 0;

        while (from <= latest && chunksThisTick < MAX_CHUNKS_PER_TICK) {

            const to = Math.min(

                from + BLOCK_CHUNK - 1,

                latest

            );

            console.log(

                `[${chain}] ${from} -> ${to}`

            );

            if (!contracts.length) {

                console.warn(
                    `[${chain}] No contracts configured.`
                );

                inspector.warn(
                    "BlockchainEngine",
                    "No contracts configured",
                    { chain }
                );

                return;

            }

            console.log(
                `[${chain}] Watching ${contracts.length} contract(s)`
            );

            console.log(contracts);

            const rangeKey = `${chain}:${from}:${to}`;
            const cachedAt = this._recentRanges.get(rangeKey);
            if (cachedAt && (Date.now() - cachedAt) < CACHE_TTL_MS) {
                console.log(`[${chain}] Skipping already-recorded range ${from}-${to} (cache hit)`);
                cursor.lastScannedBlock = to;
                cursor.lastHeartbeat = new Date();
                await cursor.save();
                from = to + 1;
                chunksThisTick++;
                continue;
            }
            this._recentRanges.set(rangeKey, Date.now());

            const logs =
                await provider.getLogs({

                    address: contracts,

                    fromBlock: from,

                    toBlock: to

                });

            /*
            -----------------------------------------
            Decode
            -----------------------------------------
            */

            let decoded = 0;

let watched = 0;

let recorded = 0;

for (const log of logs) {

    const event =
        await decoderRegistry.decode(log, chain);

    if (!event) {

        continue;

    }

    decoded++;

    const watch =
        addressFilter.match(
            event.to
        );

    if (!watch) {

        continue;

    }

    watched++;

    event.watch = watch;

    await record(event);

    recorded++;

    inspector.success(
        "BlockchainEngine",
        `Watched transfer detected`,
        {
            chain,
            token: event.token,
            to: event.to,
            value: event.value,
            txHash: event.txHash
        }
    );

}

console.log(

    `[${chain.name}] RPC:${logs.length} Decoded:${decoded} Watched:${watched} Recorded:${recorded} Discarded:${decoded-watched}`

);

            if (logs.length > 0) {
                inspector.info(
                    "BlockchainEngine",
                    `Scanned ${chain} ${from}-${to}: ${logs.length} log(s), ${decoded} decoded, ${watched} watched`,
                    { chain, from, to, rpcLogs: logs.length, decoded, watched, recorded }
                );
            }

            /*
            -----------------------------------------
            Cursor
            -----------------------------------------
            */

            cursor.lastScannedBlock = to;

            cursor.lastHeartbeat =
                new Date();

            cursor.totalBlocksScanned +=
                (to - from + 1);

            cursor.totalEventsCollected +=
                logs.length;

            await cursor.save();

            from = to + 1;
            chunksThisTick++;


        }

    }

}

export default new BlockchainEngine();
