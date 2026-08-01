/**
 * ISCAN External Observer
 *
 * Database Monitor
 *
 * Responsibilities:
 *
 * - Verify database availability
 * - Measure latency
 * - Detect connection failures
 * - Create incidents
 *
 */


const mongoose = require("mongoose");

const Incident =
require("../models/incident");



const CHECK_INTERVAL =
process.env.DB_MONITOR_INTERVAL || 15000;



let databaseHealthy = true;



async function checkDatabase(){


    const start =
    Date.now();



    try {



        await mongoose.connection.db
        .command({
            ping:1
        });



        const latency =
        Date.now() - start;



        console.log(
            `[DATABASE]
            Healthy
            Latency:
            ${latency}ms`
        );



        databaseHealthy = true;



        return {

            status:
            "HEALTHY",

            latency

        };



    }

    catch(error){



        databaseHealthy = false;



        console.error(
            "Database failure:",
            error.message
        );



        await createDatabaseIncident(
            error
        );



        return {

            status:
            "FAILED",

            error:
            error.message

        };

    }


}



async function createDatabaseIncident(
    error
){



    const existing =
    await Incident.findOne({

        service:
        "DATABASE",


        component:
        "MongoDB",


        status:{
            $in:[
                "OPEN",
                "INVESTIGATING",
                "RECOVERING"
            ]
        }

    });



    if(existing){

        return;

    }



    const incident =
    new Incident({


        service:
        "DATABASE",


        component:
        "MongoDB",


        severity:
        "CRITICAL",


        failureReason:
        "Database unavailable",



        technicalDetails:{

            error:
            error.message

        },


        history:[

            {

                action:
                "Database failure detected",

                result:
                "Awaiting recovery"

            }

        ]

    });



    await incident.save();



    console.log(
        "Database incident created"
    );



}



function startDatabaseMonitor(){


    console.log(
        "Database Monitor started"
    );



    setInterval(
        checkDatabase,
        CHECK_INTERVAL
    );


}



module.exports = {

    startDatabaseMonitor,

    checkDatabase

};
