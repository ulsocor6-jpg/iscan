import mongoose from "mongoose";

const NodeHealthSchema = new mongoose.Schema(
{
    node: {
        type: String,
        required: true
    },

    type: {
        type: String,
        default: "unknown"
    },

    status: {
        type: String,
        enum: [
            "ONLINE",
            "WARNING",
            "CRITICAL",
            "OFFLINE",
            "RECOVERING"
        ],
        default: "ONLINE"
    },

    metrics: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    error: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },

    lastSeen: {
        type: Date,
        default: Date.now
    }
},
{
    _id:false
});


const SystemHealthSchema = new mongoose.Schema(
{
    overallStatus:{
        type:String,
        enum:[
            "HEALTHY",
            "WARNING",
            "CRITICAL"
        ],
        default:"HEALTHY"
    },

    nodes:[
        NodeHealthSchema
    ]

},
{
    timestamps:true
});


export default mongoose.model(
    "SystemHealth",
    SystemHealthSchema
);
