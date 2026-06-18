import mongoose from "mongoose";

const flowerSwapSchema = new mongoose.Schema(
{
    orderId:{
        type:String,
        required:true
    },

    tokenIn:{
        type:String,
        default:"FLOWER"
    },

    tokenOut:{
        type:String,
        default:"USDC"
    },

    amountIn:Number,

    amountOut:Number,

    dex:{
        type:String,
        default:"KATANA"
    },

    txHash:String,

    slippage:Number,

    status:{
        type:String,
        default:"PENDING"
    }
},
{
    timestamps:true
});

export default mongoose.model(
    "FlowerSwap",
    flowerSwapSchema
);
