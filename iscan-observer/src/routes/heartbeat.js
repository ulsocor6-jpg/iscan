/**
 * ISCAN External Observer
 *
 * Heartbeat Route
 *
 * Responsibilities:
 *
 * - Receive ISCAN heartbeat
 * - Forward to processor
 * - Return processing result
 *
 */


const express =
require("express");


const router =
express.Router();



const {
    processHeartbeat
}
=
require("../processors/heartbeatProcessor");





// POST /heartbeat

router.post(
"/heartbeat",
async(req,res)=>{


    try {



        const result =
        await processHeartbeat(
            req.body
        );



        res.json(result);



    }


    catch(error){



        console.error(

            "Heartbeat route error:",
            error.message

        );



        res.status(500)
        .json({

            success:false,

            error:
            error.message

        });



    }


});






module.exports =
router;
