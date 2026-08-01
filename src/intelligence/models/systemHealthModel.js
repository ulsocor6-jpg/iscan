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


// TTL: auto-expire snapshots after 7 days. Without this, a snapshot every
// 60s (intelligenceCore's collection interval) accumulates ~120,960
// documents/week forever — the same unbounded-growth pattern that caused
// the earlier MongoDB Atlas storage quota issue with the orphaned `events`
// collection. Adjust the window if you need longer health history.
SystemHealthSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model(
    "SystemHealth",
    SystemHealthSchema
);
