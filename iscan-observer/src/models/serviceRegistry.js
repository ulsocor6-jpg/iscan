/**
 * ISCAN External Observer
 *
 * Service Registry Model
 *
 * Defines:
 *
 * - Known ISCAN services
 * - Importance level
 * - Monitoring rules
 * - Recovery permissions
 *
 */


const mongoose =
require("mongoose");



const serviceRegistrySchema =
new mongoose.Schema({


    serviceName: {


        type:String,

        required:true,

        unique:true,

        index:true


    },



    componentType:{


        type:String,


        enum:[

            "API",
            "WORKER",
            "WATCHER",
            "DATABASE",
            "QUEUE",
            "TREASURY",
            "SETTLEMENT",
            "NOTIFICATION"

        ],


        required:true


    },



    criticality:{


        type:String,


        enum:[

            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL"

        ],


        default:"MEDIUM"


    },



    heartbeatInterval:{


        type:Number,


        default:10000


        // milliseconds


    },



    timeoutThreshold:{


        type:Number,


        default:30000


        // milliseconds


    },



    monitoringEnabled:{


        type:Boolean,


        default:true


    },



    autoRecoveryEnabled:{


        type:Boolean,


        default:false


    },



    allowedRecoveryActions:[


        {

            type:String,


            enum:[


                "RESTART_WORKER",

                "RESTART_WATCHER",

                "RECONNECT_SERVICE",

                "RESTART_PROCESS",

                "NONE"


            ]

        }


    ],



    requiresAdminApproval:{


        type:Boolean,


        default:true


    },



    metadata:{


        type:Object,


        default:{}


    }



},


{

    timestamps:true

});





module.exports =
mongoose.model(

    "ObserverServiceRegistry",

    serviceRegistrySchema

);
