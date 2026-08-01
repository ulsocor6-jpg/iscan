/**
 * ISCAN External Observer
 *
 * Queue Monitor
 *
 * Responsibilities:
 *
 * - Monitor background jobs
 * - Detect queue congestion
 * - Detect stalled workers
 * - Create incidents
 *
 */


const Incident =
require("../models/incident");


// Configuration

const CHECK_INTERVAL =
process.env.QUEUE_MONITOR_INTERVAL || 15000;


// Thresholds

const WARNING_QUEUE_SIZE =
process.env.WARNING_QUEUE_SIZE || 100;


const CRITICAL_QUEUE_SIZE =
process.env.CRITICAL_QUEUE_SIZE || 1000;



/*
    Temporary queue registry.

    Later this connects to:

    BullMQ
    Redis
    RabbitMQ
    Kafka

*/

let queueState = [

    {

        name:
        "settlement",

        waiting:
        0,

        active:
        0

    },


    {

        name:
        "depositVerification",

        waiting:
        0,

        active:
        0

    },


    {

        name:
        "notifications",

        waiting:
        0,

        active:
        0

    }

];



async function checkQueues(){


    try {


        for(
            const queue of queueState
        ){



            console.log(

                `[QUEUE]
                ${queue.name}
                Waiting:
                ${queue.waiting}`

            );



            if(
                queue.waiting >=
                CRITICAL_QUEUE_SIZE
            ){


                await createQueueIncident(
                    queue,
                    "CRITICAL"
                );


            }


            else if(
                queue.waiting >=
                WARNING_QUEUE_SIZE
            ){


                await createQueueIncident(
                    queue,
                    "WARNING"
                );


            }


        }



    }

    catch(error){


        console.error(
            "Queue monitor error:",
            error
        );


    }


}




async function createQueueIncident(
    queue,
    severity
){



    const existing =
    await Incident.findOne({

        service:
        "QUEUE",


        component:
        queue.name,


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
        "QUEUE",


        component:
        queue.name,


        severity,


        failureReason:
        "Queue backlog detected",



        technicalDetails:{

            waitingJobs:
            queue.waiting,


            activeJobs:
            queue.active

        },


        history:[

            {

                action:
                "Queue congestion detected",

                result:
                "Monitoring"

            }

        ]

    });



    await incident.save();



    console.log(

        "Queue incident created:",
        queue.name

    );


}



function updateQueueState(
    queues
){

    queueState =
    queues;

}



function startQueueMonitor(){


    console.log(
        "Queue Monitor started"
    );



    setInterval(
        checkQueues,
        CHECK_INTERVAL
    );


}



module.exports = {

    startQueueMonitor,

    checkQueues,

    updateQueueState

};
