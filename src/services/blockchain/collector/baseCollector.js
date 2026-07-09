import { ethers } from "ethers";

import BlockchainCursor from "../../../models/blockchain/blockchainCursorModel.js";

import { record } from "../journal/blockchainInbox.js";

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const POLL_INTERVAL = 1000;

// Free Alchemy supports only 10 blocks.
const BLOCK_CHUNK = 10;

const TRANSFER_TOPIC = ethers.id(
    "Transfer(address,address,uint256)"
);

const TRANSFER_IFACE = new ethers.Interface([
    "event Transfer(address indexed from,address indexed to,uint256 value)"
]);

let provider = null;

function getProvider() {

    if (!provider) {

        provider = new ethers.JsonRpcProvider(
            process.env.BASE_RPC
        );

    }

    return provider;

}

/*
|--------------------------------------------------------------------------
| Collector
|--------------------------------------------------------------------------
*/

export async function pollBaseToken({

    tokenAddress,

    tokenSymbol,

    decimals

}) {

    const rpc = getProvider();

    /*
    --------------------------------------------------------
    Cursor
    --------------------------------------------------------
    */

    let cursor = await BlockchainCursor.findOne({

        chain: "base",

        network: "mainnet"

    });

    if (!cursor) {

        const latest = await rpc.getBlockNumber();

        cursor = await BlockchainCursor.create({

            chain: "base",

            network: "mainnet",

            collector: "baseCollector",

            lastScannedBlock: latest

        });

        console.log(
            `[BaseCollector] initialized at block ${latest}`
        );

        return;

    }

    /*
    --------------------------------------------------------
    Latest block
    --------------------------------------------------------
    */

    const latest = await rpc.getBlockNumber();

    if (latest <= cursor.lastScannedBlock) {

        cursor.lastHeartbeat = new Date();

        await cursor.save();

        return;

    }

    /*
    --------------------------------------------------------
    Scan only new blocks
    --------------------------------------------------------
    */

    let from = cursor.lastScannedBlock + 1;

    while (from <= latest) {

        const to = Math.min(
            from + BLOCK_CHUNK - 1,
            latest
        );

        console.log(
            `[BaseCollector] scanning ${from} -> ${to}`
        );

        const logs = await rpc.getLogs({

            address: tokenAddress,

            fromBlock: from,

            toBlock: to,

            topics: [

                TRANSFER_TOPIC

            ]

        });

        for (const log of logs) {

            const parsed = TRANSFER_IFACE.parseLog(log);

            const block = await rpc.getBlock(log.blockNumber);

            await record({

                chain: "base",

                network: "mainnet",

                blockNumber: log.blockNumber,

                blockHash: log.blockHash,

                txHash: log.transactionHash,

                logIndex: log.index,

                contract: tokenAddress,

                eventName: "Transfer",

                token: tokenSymbol,

                decimals,

                from: parsed.args.from.toLowerCase(),

                to: parsed.args.to.toLowerCase(),

                value: parsed.args.value.toString(),

                timestamp: new Date(
                    Number(block.timestamp) * 1000
                ),

                raw: log

            });

        }

        cursor.lastScannedBlock = to;

        cursor.lastHeartbeat = new Date();

        cursor.totalBlocksScanned += (to - from + 1);

        cursor.totalEventsCollected += logs.length;

        await cursor.save();

        from = to + 1;

    }

}

/*
|--------------------------------------------------------------------------
| Start Collector
|--------------------------------------------------------------------------
*/

let timer = null;

export function startBaseCollector(config) {

    if (timer) {

        console.warn(
            "[BaseCollector] already running."
        );

        return;

    }

    console.log(
        `[BaseCollector] polling every ${POLL_INTERVAL}ms`
    );

    timer = setInterval(async () => {

        try {

            await pollBaseToken(config);

        } catch (err) {

            console.error(
                "[BaseCollector]",
                err.message
            );

        }

    }, POLL_INTERVAL);

}

export function stopBaseCollector() {

    if (!timer) return;

    clearInterval(timer);

    timer = null;

}
