import mongoose from "mongoose";

const schema =
new mongoose.Schema(
{
    userId:
    {
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    amount:Number,

    destinationType:
    {
        type:String,
        enum:
        [
            "MAYA",
            "COINSPH",
            "BANK",
            "GCASH",
            "AGENT"
        ]
    },

    destinationAccount:String,

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
    "CashoutRequest",
    schema
);
