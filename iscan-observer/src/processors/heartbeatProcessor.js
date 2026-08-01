/**
 * ISCAN External Observer
 *
 * Heartbeat Processor
 *
 * Responsibilities:
 *
 * - Process incoming heartbeat signals
 * - Validate services
 * - Update service health
 * - Synchronize observer memory
 *
 */


const Heartbeat =
require("../models/heartbeat");


const ServiceRegistry =
require("../models/serviceRegistry");



const Incident =
require("../models/incident");





async function processHeartbeat(
    data
){

    try {


        const {

            service,

            status,

            metadata = {}

        } = data;




        if(!service){


            throw new Error(
                "Heartbeat missing service name"
            );


        }





        /*
            Check if service exists
            in observer registry
        */


        const registeredService =
        await ServiceRegistry.findOne({

            serviceName:
            service

        });





        if(!registeredService){


            await createUnknownServiceIncident(
                data
            );



            return {

                accepted:false,

                reason:
                "Unknown service"

            };


        }






        /*
            Update heartbeat memory
        */


        let heartbeat =
        await Heartbeat.findOne({

            service

        });





        if(!heartbeat){


            heartbeat =
            new Heartbeat({

                service,

                component:
                registeredService.componentType

            });


        }






        heartbeat.status =
        normalizeStatus(status);



        heartbeat.lastHeartbeat =
        new Date();



        heartbeat.missedHeartbeats =
        0;



        heartbeat.metadata =
        metadata;



        await heartbeat.save();






        return {


            accepted:true,


            service,


            status:
            heartbeat.status


        };



    }


    catch(error){


        console.error(

            "Heartbeat processor error:",
            error.message

        );


        return {


            accepted:false,


            error:
            error.message


        };


    }


}





function normalizeStatus(
    status
){


    const allowed = [

        "HEALTHY",

        "WARNING",

        "FAILED",

        "RECOVERING"

    ];



    if(
        allowed.includes(status)
    ){

        return status;

    }



    return "UNKNOWN";


}





async function createUnknownServiceIncident(
    data
){



    const incident =
    new Incident({

        service:
        data.service || "UNKNOWN",


        component:
        "UNKNOWN",


        severity:
        "WARNING",


        failureReason:
        "Unregistered heartbeat source",



        technicalDetails:
        data,



        history:[

            {

                action:
                "Unknown service heartbeat received",

                result:
                "Requires review"

            }

        ]

    });



    await incident.save();



}






module.exports =
{

    processHeartbeat

};
