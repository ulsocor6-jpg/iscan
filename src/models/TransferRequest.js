import mongoose from "mongoose";

const schema =
new mongoose.Schema(
{
    senderId:
    {
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    sourceWallet:
    {
        type:String,
        default:"PHP"
    },

    destinationType:
    {
        type:String,
        required:true
    },

    destinationAccount:
    {
        type:String,
        required:true
    },

    amount:
    {
        type:Number,
        required:true
    },

    fee:
    {
        type:Number,
        default:0
    },

    provider:
    {
        type:String
    },

    status:
    {
        type:String,
        default:"PENDING"
    }
},
{
    timestamps:true
});

export default mongoose.model(
    "TransferRequest",
    schema
);
