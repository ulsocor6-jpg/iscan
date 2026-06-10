import mongoose from "mongoose";

const beneficiarySchema = new mongoose.Schema(
{
    ownerUserId:
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    nickname:
    {
        type: String,
        required: true
    },

    destinationType:
    {
        type: String,
        enum:
        [
            "ISCAN",
            "MAYA",
            "COINSPH",
            "BANK",
            "GCASH",
            "REMITTANCE"
        ],
        required: true
    },

    accountName:
    {
        type: String,
        required: true
    },

    accountNumber:
    {
        type: String,
        required: true
    }
},
{
    timestamps: true
});

export default mongoose.model(
    "Beneficiary",
    beneficiarySchema
);
