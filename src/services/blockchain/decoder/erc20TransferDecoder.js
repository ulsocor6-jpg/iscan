import { ethers } from "ethers";

const ERC20_TRANSFER_TOPIC = ethers.id(
    "Transfer(address,address,uint256)"
);

const iface = new ethers.Interface([
    "event Transfer(address indexed from,address indexed to,uint256 value)"
]);

class ERC20TransferDecoder {

    constructor() {

        this.name = "ERC20TransferDecoder";

        /**
         * Registered Tokens
         *
         * address -> metadata
         */
        this.tokens = new Map();

    }

    /**
     * Register ERC20 token
     */
    registerToken({

        chain,

        address,

        symbol,

        decimals

    }) {

        this.tokens.set(
            `${chain}:${address.toLowerCase()}`,
            {

                chain,

                address: address.toLowerCase(),

                symbol,

                decimals

            }
        );

    }

    /**
     * Decode Transfer Event
     */
    async decode(rawLog, chain) {

        if (
            !rawLog.topics ||
            rawLog.topics[0] !== ERC20_TRANSFER_TOPIC
        ) {

            return null;

        }

        const contract =
            rawLog.address.toLowerCase();

        const token = this.tokens.get(`${chain}:${contract}`);

        if (!token) {

            return null;

        }

        const parsed =
            iface.parseLog(rawLog);

        return {

            chain: token.chain,

            network: "mainnet",

            blockNumber: rawLog.blockNumber,

            blockHash: rawLog.blockHash,

            txHash: rawLog.transactionHash,

            logIndex: rawLog.index,

            contract,

            eventName: "Transfer",

            token: token.symbol,

            decimals: token.decimals,

            from:
                parsed.args.from.toLowerCase(),

            to:
                parsed.args.to.toLowerCase(),

            // FIX: previously stored the raw base-unit integer
            // (e.g. 2000000000000000000 for 2 FLOWER at 18 decimals)
            // with nothing downstream ever dividing it back down.
            // ethers.formatUnits converts it to a human-readable
            // decimal string ("2.0") using the token's registered
            // decimals, so Deposit.amount, Wallet credit, and
            // Ledger.credit all get the correct amount automatically.
            value:
                ethers.formatUnits(
                    parsed.args.value,
                    token.decimals
                ),

            confirmations: 0,

            raw: rawLog

        };

    }

}

export default new ERC20TransferDecoder();
