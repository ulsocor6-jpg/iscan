import mongoose from "mongoose";

const flowerOrderSchema = new mongoose.Schema(
{
    orderId:{ type:String, required:true, unique:true },
    userId:{ type:mongoose.Schema.Types.ObjectId, ref:"User", required:true },
    token:{ type:String, default:"FLOWER" },
    chain:{ type:String, default:"RONIN" },
    source:{ type:String, enum:["GENERIC","USDT_WIDGET"], default:"GENERIC" },
    direction:{ type:String, enum:["FLOWER_TO_USDC","USDC_TO_FLOWER"], default:"FLOWER_TO_USDC" },
    depositAddress:{ type:String, required: function() { return this.direction === "FLOWER_TO_USDC"; } },
    expectedAmount:{ type:Number, required: function() { return this.direction === "FLOWER_TO_USDC"; } },
    receivedAmount:{ type:Number, default:0 },
    usdcAmountIn:{ type:Number, default:0 },
    flowerAmountOut:{ type:Number, default:0 },

    // USDC_TO_FLOWER only. true = the pipeline currently holds USDC debited
    // from the user (debit succeeded, swap not yet confirmed/refunded) —
    // retry should go straight to the swap executor. false = no debit is
    // currently in effect (never debited due to insufficient balance, or
    // already auto-refunded after a prior failure) — retry must re-check
    // balance and re-debit before attempting the swap, never call the
    // executor directly, or the user gets FLOWER without ever paying USDC.
    usdcHeld:{ type:Boolean, default:false },
    txHash:{ type:String, unique:true, sparse:true, index:true },
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
