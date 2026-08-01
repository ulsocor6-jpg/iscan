const axios = require("axios");


const OBSERVER_URL =
process.env.OBSERVER_URL ||
"http://localhost:4000";



async function sendHeartbeat(
    service,
    metadata = {}
){

    try {

        const response =
        await axios.post(

            `${OBSERVER_URL}/heartbeat`,

            {
                service,

                status:"HEALTHY",

                metadata
            },

            {
                timeout:5000
            }

        );


        return response.data;


    } catch(error){


        console.error(

            "Observer heartbeat failed:",
            service,
            error.message

        );


        return {

            accepted:false,

            error:error.message

        };


    }

}



module.exports = {
    sendHeartbeat
};
