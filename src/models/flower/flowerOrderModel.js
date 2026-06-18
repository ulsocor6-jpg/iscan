import mongoose from "mongoose";

const flowerOrderSchema = new mongoose.Schema(
{
    orderId:{
        type:String,
        required:true,
        unique:true
    },

    userId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
        required:true
    },

    token:{
        type:String,
        default:"FLOWER"
    },

    chain:{
        type:String,
        default:"RONIN"
    },

    depositAddress:{
        type:String,
        required:true
    },

    expectedAmount:{
        type:Number,
        required:true
    },

    receivedAmount:{
        type:Number,
        default:0
    },

    txHash:{
        type:String
    },

    swapTxHash:{
        type:String
    },

    usdcReceived:{
        type:Number,
        default:0
    },

    feePercent:{
        type:Number,
        default:2
    },

    feeAmount:{
        type:Number,
        default:0
    },

    phpAmount:{
        type:Number,
        default:0
    },

    status:{
        type:String,
        enum:[
            "CREATED",
            "WAITING_DEPOSIT",
            "DEPOSIT_RECEIVED",
            "VERIFIED",
            "SWAPPING",
            "SWAPPED",
            "SETTLING",
            "COMPLETED",
            "FAILED"
        ],
        default:"CREATED"
    }

},
{
    timestamps:true
});

export default mongoose.model(
    "FlowerOrder",
    flowerOrderSchema
);
