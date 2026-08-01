/**
 * ISCAN External Observer
 *
 * Telegram Alert Service
 *
 * Responsibilities:
 *
 * - Notify administrators
 * - Report incidents
 * - Report recovery actions
 *
 */


const axios = require("axios");



const TELEGRAM_BOT_TOKEN =
process.env.TELEGRAM_BOT_TOKEN;


const TELEGRAM_CHAT_ID =
process.env.TELEGRAM_CHAT_ID;





async function sendTelegramMessage(
    message
){



    try {



        if(
            !TELEGRAM_BOT_TOKEN ||
            !TELEGRAM_CHAT_ID
        ){


            console.log(
                "Telegram not configured"
            );


            return {

                success:false,

                message:
                "Missing Telegram configuration"

            };


        }





        const url =
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;





        await axios.post(
            url,
            {

                chat_id:
                TELEGRAM_CHAT_ID,


                text:
                message,


                parse_mode:
                "HTML"

            }

        );



        return {

            success:true

        };



    }


    catch(error){



        console.error(

            "Telegram alert failed:",
            error.message

        );



        return {

            success:false,

            error:
            error.message

        };


    }



}





function formatIncidentAlert(
    incident
){



    return `

🚨 <b>ISCAN INCIDENT</b>


<b>Service:</b>
${incident.service}


<b>Component:</b>
${incident.component}


<b>Severity:</b>
${incident.severity}


<b>Status:</b>
${incident.status}


<b>Reason:</b>
${incident.failureReason}


<b>Detected:</b>
${incident.detectedAt}


<b>Recovery:</b>
${incident.recoveryResult}


`;



}






function formatRecoveryAlert(
    incident
){



    return `

✅ <b>ISCAN RECOVERY</b>


<b>Service:</b>
${incident.service}


<b>Action:</b>
${incident.recoveryAction}


<b>Result:</b>
${incident.recoveryResult}


<b>Resolved:</b>
${incident.resolvedAt}


`;



}







async function notifyIncident(
    incident
){


    const message =
    formatIncidentAlert(
        incident
    );


    return sendTelegramMessage(
        message
    );


}






async function notifyRecovery(
    incident
){


    const message =
    formatRecoveryAlert(
        incident
    );


    return sendTelegramMessage(
        message
    );


}






module.exports = {


    sendTelegramMessage,


    notifyIncident,


    notifyRecovery


};
