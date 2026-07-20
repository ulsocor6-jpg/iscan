import mongoose from "mongoose";

const OperatorActionSchema = new mongoose.Schema({

    incidentId: { type: String, index: true },
    code: { type: String, index: true },
    orderId: { type: String, index: true },
    pipeline: String,

    // What the engine found before acting — this is the "checked the
    // system first" record, so every action is auditable against the
    // state it was based on.
    checkedState: mongoose.Schema.Types.Mixed,

    outcome: {
        type: String,
        enum: ["SUCCEEDED", "FAILED", "SKIPPED"],
        required: true
    },

    reason: String,     // why SKIPPED, or the error if FAILED
    resultStatus: String, // order.status after the action, if applicable

    triggeredBy: { type: String, default: "auto" }

}, { timestamps: true });

export default mongoose.model("OperatorAction", OperatorActionSchema);
