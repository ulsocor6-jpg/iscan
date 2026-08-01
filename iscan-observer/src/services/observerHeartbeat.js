/**
 * ISCAN Core
 *
 * External Observer Heartbeat Client
 *
 * Responsibilities:
 *
 * - Send health signals
 * - Report service status
 * - Never block ISCAN operations
 *
 */


const axios =
require("axios");



const OBSERVER_URL =
process.env.OBSERVER_URL;



const HEARTBEAT_INTERVAL =
process.env.HEARTBEAT_INTERVAL || 10000;



const SERVICE_NAME =
process.env.SERVICE_NAME ||
"ISCAN_CORE";





let heartbeatData = {


    service:
    SERVICE_NAME,


    status:
    "STARTING",


    metadata:{}


};





function updateHeartbeat(
    data
){


    heartbeatData = {


        ...heartbeatData,


        ...data,


        timestamp:
        new Date()


    };


}





async function sendHeartbeat(){


    try {


        if(
            !OBSERVER_URL
        ){

            return;

        }




        await axios.post(

            `${OBSERVER_URL}/heartbeat`,

            heartbeatData,

            {

                timeout:
                3000

            }

        );



        console.log(

            "[OBSERVER]
            heartbeat sent"

        );



    }


    catch(error){



        /*
            Important:

            Observer failure must NOT
            stop ISCAN.

        */


        console.warn(

            "[OBSERVER]
            unavailable"

        );


    }



}





function startHeartbeat(){



    console.log(

        "Observer heartbeat started"

    );



    heartbeatData.status =
    "HEALTHY";



    setInterval(

        sendHeartbeat,

        HEARTBEAT_INTERVAL

    );



}





module.exports = {


    startHeartbeat,


    updateHeartbeat


};
