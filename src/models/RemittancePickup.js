import mongoose from "mongoose";

const schema =
new mongoose.Schema(
{
    senderId:
    {
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },

    receiverName:String,

    amount:Number,

    pickupCode:
    {
        type:String,
        unique:true
    },

    status:
    {
        type:String,
        default:"READY"
    }
},
{
    timestamps:true
});

export default mongoose.model(
    "RemittancePickup",
    schema
);
