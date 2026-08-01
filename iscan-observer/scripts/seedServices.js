require("dotenv").config();

const mongoose = require("mongoose");

const ServiceRegistry =
require("../src/models/serviceRegistry");


const services = [

{
    serviceName:"ISCAN_API",
    componentType:"API",
    criticality:"HIGH",
    heartbeatInterval:10000,
    timeoutThreshold:30000,
    autoRecoveryEnabled:false,
    requiresAdminApproval:true
},

{
    serviceName:"LEDGER",
    componentType:"DATABASE",
    criticality:"CRITICAL",
    heartbeatInterval:10000,
    timeoutThreshold:30000,
    autoRecoveryEnabled:false,
    requiresAdminApproval:true
},

{
    serviceName:"BLOCKCHAIN_COLLECTOR",
    componentType:"WATCHER",
    criticality:"HIGH",
    heartbeatInterval:10000,
    timeoutThreshold:30000,
    autoRecoveryEnabled:true,
    allowedRecoveryActions:[
        "RESTART_WATCHER"
    ],
    requiresAdminApproval:false
},

{
    serviceName:"RONIN_WATCHER",
    componentType:"WATCHER",
    criticality:"HIGH",
    heartbeatInterval:10000,
    timeoutThreshold:30000,
    autoRecoveryEnabled:true,
    allowedRecoveryActions:[
        "RESTART_WATCHER"
    ],
    requiresAdminApproval:false
},

{
    serviceName:"BASE_WATCHER",
    componentType:"WATCHER",
    criticality:"HIGH",
    heartbeatInterval:10000,
    timeoutThreshold:30000,
    autoRecoveryEnabled:true,
    allowedRecoveryActions:[
        "RESTART_WATCHER"
    ],
    requiresAdminApproval:false
},

{
    serviceName:"TREASURY_BALANCER",
    componentType:"TREASURY",
    criticality:"CRITICAL",
    heartbeatInterval:15000,
    timeoutThreshold:45000,
    autoRecoveryEnabled:false,
    requiresAdminApproval:true
},

{
    serviceName:"SETTLEMENT_WORKER",
    componentType:"SETTLEMENT",
    criticality:"HIGH",
    heartbeatInterval:10000,
    timeoutThreshold:30000,
    autoRecoveryEnabled:true,
    allowedRecoveryActions:[
        "RESTART_WORKER"
    ],
    requiresAdminApproval:false
},

{
    serviceName:"NOTIFICATION_SERVICE",
    componentType:"NOTIFICATION",
    criticality:"MEDIUM",
    heartbeatInterval:30000,
    timeoutThreshold:60000,
    autoRecoveryEnabled:true,
    allowedRecoveryActions:[
        "RESTART_PROCESS"
    ],
    requiresAdminApproval:false
}

];


async function seed(){

    await mongoose.connect(
        process.env.OBSERVER_DB_URI
    );


    await ServiceRegistry.deleteMany({});


    await ServiceRegistry.insertMany(
        services
    );


    console.log(
        "Observer services seeded:",
        services.length
    );


    process.exit(0);

}


seed();
