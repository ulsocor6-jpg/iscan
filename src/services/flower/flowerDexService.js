import { ethers } from "ethers";

import flowerConfig from "../../../config/flower.js";
import {
    KATANA_ROUTER_ABI,
    ERC20_ABI,
    RONIN_TOKENS,
    SWAP_DEADLINE_SECONDS
} from "../../../config/katana.js";

import {
    recordPendingOperation,
    setPendingOperationAmount
} from "../blockchain/pendingOperationService.js";

const {

    RONIN_RPC,

    TREASURY_PRIVATE_KEY,

    KATANA_ROUTER,

    FLOWER_TOKEN

} = flowerConfig;

export async function executeFlowerToUsdcSwap({

    orderId,

    amountIn,

    minOutputRaw

}) {

    const provider =
        new ethers.JsonRpcProvider(RONIN_RPC);

    const signer =
        new ethers.Wallet(

            TREASURY_PRIVATE_KEY,

            provider

        );

    const router =
        new ethers.Contract(

            KATANA_ROUTER,

            KATANA_ROUTER_ABI,

            signer

        );

    const flower =
        new ethers.Contract(

            FLOWER_TOKEN,

            ERC20_ABI,

            signer

        );

    const amountInWei =
        ethers.parseUnits(

            amountIn.toString(),

            18

        );

    const deadline =
        Math.floor(Date.now()/1000)
        + SWAP_DEADLINE_SECONDS;

    const path = [

        RONIN_TOKENS.FLOWER,

        RONIN_TOKENS.USDC

    ];

    await (await flower.approve(

        KATANA_ROUTER,

        amountInWei

    )).wait();

    const tx =
        await router.swapExactTokensForTokens(

            amountInWei,

            minOutputRaw,

            path,

            signer.address,

            deadline

        );

    await recordPendingOperation({

        type: "FLOWER_SWAP",

        chain: "ronin",

        txHash: tx.hash,

        token: "USDC",

        referenceId: orderId

    });

    const receipt =
        await tx.wait();

    const usdcReceived =
        parseUsdcFromReceipt(

            receipt,

            RONIN_TOKENS.USDC

        );

    await setPendingOperationAmount({

        chain: "ronin",

        txHash: receipt.hash,

        actualAmount: usdcReceived

    });

    return {

        txHash: receipt.hash,

        amountOut: usdcReceived,

        receipt

    };

}

function parseUsdcFromReceipt(

    receipt,

    usdcAddress

){

    const topic =
        ethers.id(
            "Transfer(address,address,uint256)"
        );

    for(const log of receipt.logs){

        if(

            log.address.toLowerCase()
            !== usdcAddress.toLowerCase()

        ) continue;

        if(log.topics[0]!==topic) continue;

        const value =
            ethers.AbiCoder
            .defaultAbiCoder()
            .decode(
                ["uint256"],
                log.data
            )[0];

        return Number(

            ethers.formatUnits(

                value,

                6

            )

        );

    }

    throw new Error(
        "USDC transfer not found."
    );

}
