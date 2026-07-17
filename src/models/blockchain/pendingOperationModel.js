import mongoose from "mongoose";

const PendingOperationSchema = new mongoose.Schema(
{
    type:{
        type:String,
        required:true,
        enum:[
            "DEPOSIT",
            "SWAP",
            "WITHDRAWAL",
            "FLOWER_SWEEP",
            "FLOWER_SWAP",
            "FLOWER_SETTLE",
            "FLOWER_REVERSE_SWAP",
            "INTERNAL_TRANSFER",
            "OTHER"
        ],
        index:true
    },

    chain:{
        type:String,
        required:true,
        index:true
    },

    txHash:{
        type:String,
        required:true,
        index:true
    },

    expectedAddress:{
        type:String,
        default:null
    },

    token:{
        type:String,
        default:null
    },

    referenceId:{
        type:String,
        default:null,
        index:true
    },

    status:{
        type:String,
        enum:[
            "OPEN",
            "PROCESSING",
            "COMPLETED",
            "FAILED",
            "EXPIRED"
        ],
        default:"OPEN",
        index:true
    },

    actualAmount:{
        type:Number,
        default:null
    },

    claimedAt:{
        type:Date,
        default:null
    },

    completedAt:{
        type:Date,
        default:null
    },

    retryCount:{
        type:Number,
        default:0
    },

    lastError:{
        type:String,
        default:null
    },

    blockchainInboxId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"BlockchainInbox",
        default:null
    },

    metadata:{
        type:mongoose.Schema.Types.Mixed,
        default:{}
    },

    expireAt:{
        type:Date,
        default:()=>new Date(
            Date.now()+24*60*60*1000
        ),
        index:{expires:0}
    }

},
{
    timestamps:true
}
);

PendingOperationSchema.index(
{
    chain:1,
    txHash:1
},
{
    unique:true
}
);

export default mongoose.model(
    "PendingOperation",
    PendingOperationSchema
);
