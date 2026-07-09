import mongoose from "mongoose";

const flowerOrderSchema = new mongoose.Schema(
{
    orderId:{ type:String, required:true, unique:true },
    userId:{ type:mongoose.Schema.Types.ObjectId, ref:"User", required:true },
    token:{ type:String, default:"FLOWER" },
    chain:{ type:String, default:"RONIN" },
    source:{ type:String, enum:["GENERIC","USDT_WIDGET"], default:"GENERIC" },
    depositAddress:{ type:String, required:true },
    expectedAmount:{ type:Number, required:true },
    receivedAmount:{ type:Number, default:0 },
    txHash:{ type:String },
    lastScannedBlock:{ type:Number },
    failureReason:{ type:String },

    // currentStage tracks which pipeline stage an order is on/stuck at,
    // so a resumed/retried order knows exactly where to pick back up.
    currentStage:{
        type:String,
        enum:["DEPOSIT","SWEEP","SWAP","SETTLE"]
    },

    stageFailedAt:{ type:Date },

    sweepAttempts:{ type:Number, default:0 },
    swapAttempts:{ type:Number, default:0 },
    settleAttempts:{ type:Number, default:0 },

    sweepTxHash:{ type:String },
    swapTxHash:{ type:String },
    usdcReceived:{ type:Number, default:0 },

    feePercent:{ type:Number, default:2 },
    feeAmount:{ type:Number, default:0 },
    phpAmount:{ type:Number, default:0 },

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
            "FAILED_SWEEP",
            "FAILED_SWAP",
            "FAILED_SETTLE",
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
