/**
 * ISCAN External Observer
 *
 * Heartbeat Model
 *
 * Stores:
 * - service identity
 * - health status
 * - last communication
 * - failures
 * - recovery state
 */

const mongoose = require("mongoose");


const heartbeatSchema = new mongoose.Schema({

    service: {
        type: String,
        required: true,
        index: true
    },


    component: {
        type: String,
        required: true
    },


    status: {
        type: String,
        enum: [
            "HEALTHY",
            "WARNING",
            "FAILED",
            "RECOVERING",
            "UNKNOWN"
        ],
        default: "UNKNOWN"
    },


    lastHeartbeat: {
        type: Date,
        default: Date.now
    },


    lastResponseTime: {
        type: Number,
        default: 0
        // milliseconds
    },


    missedHeartbeats: {
        type: Number,
        default: 0
    },


    restartAttempts: {
        type: Number,
        default: 0
    },


    metadata: {

        type: Object,

        default: {}

        /*
        Example:

        {
            blockHeight: 481920,
            queueSize: 4,
            database: "connected"
        }

        */

    },


    createdAt: {
        type: Date,
        default: Date.now
    },


    updatedAt: {
        type: Date,
        default: Date.now
    }


});


// Automatically update timestamp

heartbeatSchema.pre(
    "save",
    function(next){

        this.updatedAt = new Date();

        next();

    }
);



module.exports = mongoose.model(
    "ObserverHeartbeat",
    heartbeatSchema
);
