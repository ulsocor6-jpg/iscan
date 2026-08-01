/**
 * ISCAN External Observer
 *
 * Incident Model
 *
 * Permanent journal of:
 * - failures
 * - warnings
 * - recovery attempts
 * - resolutions
 */

const mongoose = require("mongoose");


const incidentSchema = new mongoose.Schema({

    incidentId: {

        type: String,

        unique: true,

        index: true

    },


    service: {

        type: String,

        required: true,

        index: true

    },


    component: {

        type: String,

        required: true

    },


    severity: {

        type: String,

        enum: [
            "INFO",
            "WARNING",
            "CRITICAL",
            "EMERGENCY"
        ],

        default: "WARNING"

    },


    status: {

        type: String,

        enum: [

            "OPEN",
            "INVESTIGATING",
            "RECOVERING",
            "RESOLVED",
            "ESCALATED"

        ],

        default: "OPEN"

    },


    detectedAt: {

        type: Date,

        default: Date.now

    },


    resolvedAt: {

        type: Date,

        default: null

    },


    failureReason: {

        type: String,

        default: "Unknown"

    },


    technicalDetails: {

        type: Object,

        default: {}

        /*
        Example:

        {
            errorCode:
            "RPC_TIMEOUT",

            message:
            "Provider rejected request",

            lastSuccessfulBlock:
            481920
        }

        */

    },


    recoveryAction: {

        type: String,

        default: null

    },


    recoveryResult: {

        type: String,

        enum: [

            "NOT_ATTEMPTED",
            "SUCCESS",
            "FAILED",
            "REQUIRES_ADMIN"

        ],

        default: "NOT_ATTEMPTED"

    },


    adminNotified: {

        type: Boolean,

        default: false

    },


    aiAnalysis: {

        type: Object,

        default: {}

        /*
        Future:

        {
            probableCause:"",
            recommendation:"",
            confidence:0.93
        }

        */

    },


    history: [

        {

            action: String,

            timestamp: {

                type: Date,

                default: Date.now

            },

            result: String

        }

    ]


});



// Generate incident ID automatically

incidentSchema.pre(
    "validate",
    function(next){

        if(!this.incidentId){

            this.incidentId =
            "INC-" +
            Date.now();

        }


        next();

    }
);



module.exports = mongoose.model(
    "ObserverIncident",
    incidentSchema
);
