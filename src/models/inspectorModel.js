import mongoose from "mongoose";

const StageSchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: [
            "PENDING",
            "RUNNING",
            "SUCCESS",
            "FAILED",
            "SKIPPED"
        ],
        default: "PENDING"
    },

    startedAt: Date,

    finishedAt: Date,

    durationMs: Number,

    input: mongoose.Schema.Types.Mixed,

    output: mongoose.Schema.Types.Mixed,

    query: mongoose.Schema.Types.Mixed,

    result: mongoose.Schema.Types.Mixed,

    decision: mongoose.Schema.Types.Mixed,

    error: String
},
{
    _id: false
});

const InspectorSchema = new mongoose.Schema({

    flowId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    pipeline: {
        type: String,
        index: true
    },

    source: {
        type: String
    },

    transactionType: {
        type: String
    },

    status: {
        type: String,
        enum: [
            "RUNNING",
            "SUCCESS",
            "FAILED"
        ],
        default: "RUNNING"
    },

    referenceId: String,

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    amount: Number,

    currency: String,

    sender: String,

    senderPhone: String,

    senderLastFour: String,

    rawNotification: mongoose.Schema.Types.Mixed,

    parsedNotification: mongoose.Schema.Types.Mixed,

    stages: [StageSchema]

},
{
    timestamps: true
});

export default mongoose.model(
    "Inspector",
    InspectorSchema
);
