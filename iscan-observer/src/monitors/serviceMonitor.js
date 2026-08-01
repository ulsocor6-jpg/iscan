/**
 * ISCAN External Observer
 *
 * Service Monitor
 *
 * Responsibilities:
 *
 * - Check service heartbeats
 * - Detect failures
 * - Create incidents
 * - Update service health
 *
 */


const Heartbeat =
require("../models/heartbeat");


const Incident =
require("../models/incident");



// Configuration

const CHECK_INTERVAL =
process.env.MONITOR_INTERVAL || 10000;


// heartbeat timeout

const HEARTBEAT_TIMEOUT =
process.env.HEARTBEAT_TIMEOUT || 30000;



async function checkServices(){


    try {


        const services =
        await Heartbeat.find();



        const now =
        Date.now();



        for(const service of services){



            const lastSeen =
            new Date(
                service.lastHeartbeat
            ).getTime();



            const difference =
            now - lastSeen;



            /*
             Healthy

             heartbeat received recently
            */


            if(
                difference <
                HEARTBEAT_TIMEOUT
            ){


                if(
                    service.status !==
                    "HEALTHY"
                ){

                    service.status =
                    "HEALTHY";

                    service.missedHeartbeats =
                    0;


                    await service.save();


                }


                continue;

            }



            /*
             Missing heartbeat detected
            */


            service.missedHeartbeats++;


            service.status =
            "WARNING";



            await service.save();



            console.log(
                `[WARNING]
                ${service.service}
                missed heartbeat`
            );



            await createIncident(
                service
            );



        }



    }

    catch(error){


        console.error(
            "Service monitor error:",
            error
        );


    }



}



async function createIncident(
    service
){



    const existingIncident =
    await Incident.findOne({

        service:
        service.service,


        component:
        service.component,


        status:{
            $in:[
                "OPEN",
                "INVESTIGATING",
                "RECOVERING"
            ]
        }

    });



    // Prevent duplicate incidents

    if(existingIncident){

        return;

    }



    const incident =
    new Incident({

        service:
        service.service,


        component:
        service.component,


        severity:
        "WARNING",


        failureReason:
        "Heartbeat timeout",


        technicalDetails:{

            lastHeartbeat:
            service.lastHeartbeat,


            missedHeartbeats:
            service.missedHeartbeats

        },


        history:[

            {

                action:
                "Failure detected",

                result:
                "Waiting for recovery"

            }

        ]

    });



    await incident.save();



    console.log(

        "New incident created:",
        incident.incidentId

    );



}



// Start monitoring loop

function startServiceMonitor(){


    console.log(
        "Service Monitor started"
    );


    setInterval(
        checkServices,
        CHECK_INTERVAL
    );


}



module.exports =
{
    startServiceMonitor,
    checkServices
};
