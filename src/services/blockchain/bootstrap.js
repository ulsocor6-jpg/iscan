import "./inspector/inspectorBridge.js"; // must load first so no early events are missed

import blockchainEngine from "./collector/blockchainEngine.js";

import decoderRegistry from "./decoder/decoderRegistry.js";
import erc20TransferDecoder from "./decoder/erc20TransferDecoder.js";

import watchLoader from "./watch/watchLoader.js";

import transactionPipeline from "./pipeline/transactionPipeline.js";
import consumerDispatcher from "./pipeline/consumerDispatcher.js";

import workScheduler from "./scheduler/workScheduler.js";

import recoveryWorker from "./workers/recoveryWorker.js";
import confirmationWorker from "./workers/confirmationWorker.js";
import depositProcessor from "./workers/depositProcessor.js";
import walletCreditWorker from "./workers/walletCreditWorker.js";
import ledgerWorker from "./workers/ledgerWorker.js";
import dashboardWorker from "./workers/dashboardWorker.js";
import flowerInboxWorker from "./workers/flowerInboxWorker.js";
import flowerBaseRetryWorker from "./workers/flowerBaseRetryWorker.js";
import flowerRoninRetryWorker from "./workers/flowerRoninRetryWorker.js";

class BlockchainBootstrap {

    async start() {

        console.log("");
        console.log("========================================");
        console.log("Starting ISCAN Blockchain Engine");
        console.log("========================================");

        /*
        ----------------------------------------
        Load watched deposit addresses
        ----------------------------------------
        */

        await watchLoader.load();

        /*
        ----------------------------------------
        Register ERC20 decoder
        ----------------------------------------
        */

        decoderRegistry.register(
            erc20TransferDecoder
        );

        /*
        ----------------------------------------
        Register supported tokens
        ----------------------------------------
        */

        const tokens = [

            {
                chain: "base",
                address: process.env.BASE_USDC_TOKEN,
                symbol: "USDC",
                decimals: 6
            },

            {
                chain: "base",
                address: process.env.BASE_DEPOSIT_TOKEN,
                symbol: "FLOWER",
                decimals: 18
            },

            {
                chain: "ronin",
                address: process.env.RONIN_USDC_TOKEN,
                symbol: "USDC",
                decimals: 6
            },

            {
                chain: "ronin",
                address: process.env.FLOWER_TOKEN,
                symbol: "FLOWER",
                decimals: 18
            }

        ];

        for (const token of tokens) {

            if (!token.address) {

                console.warn(
                    `[Bootstrap] Skipping ${token.chain} ${token.symbol}`
                );

                continue;

            }

            erc20TransferDecoder.registerToken(token);

            console.log(
                `[Bootstrap] Registered ${token.chain} ${token.symbol}`
            );

        }

        /*
        ----------------------------------------
        Register chains
        ----------------------------------------
        */

        blockchainEngine.register({

            chain: "base",

            network: "mainnet",

            rpc: process.env.BASE_RPC,

            contracts: [

                process.env.BASE_USDC_TOKEN,

                process.env.BASE_DEPOSIT_TOKEN

            ].filter(Boolean)

        });

        blockchainEngine.register({

            chain: "ronin",

            network: "mainnet",

            rpc: process.env.RONIN_RPC,

            contracts: [

                process.env.RONIN_USDC_TOKEN,

                process.env.FLOWER_TOKEN

            ].filter(Boolean)

        });

        /*
        ----------------------------------------
        Workers
        ----------------------------------------
        */

        workScheduler.register(
            confirmationWorker
        );

        workScheduler.register(
            depositProcessor
        );

        workScheduler.register(
            walletCreditWorker
        );

        workScheduler.register(
            ledgerWorker
        );

        workScheduler.register(
            dashboardWorker
        );
        workScheduler.register(
            flowerInboxWorker
        );

        workScheduler.register(
            flowerBaseRetryWorker
        );

        workScheduler.register(
            flowerRoninRetryWorker
        );

        /*
        ----------------------------------------
        Pipeline
        ----------------------------------------
        */

        consumerDispatcher.start();

        transactionPipeline.start();

        workScheduler.start();

        recoveryWorker.start();

        /*
        ----------------------------------------
        Collector
        ----------------------------------------
        */

        blockchainEngine.start();

        console.log("");

        console.log(
            "[Bootstrap] Blockchain Engine Ready."
        );

    }

}

export default new BlockchainBootstrap();
