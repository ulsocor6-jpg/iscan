/**
 * ======================================================
 * ISCAN External Observer
 *
 * HTTP Server
 *
 * This file ONLY serves HTTP.
 * It NEVER starts monitors.
 * It NEVER connects MongoDB.
 * It NEVER performs recovery.
 * ======================================================
 */

const express = require("express");
const path = require("path");

function startServer(observerState) {

    const app = express();

    app.use(express.json());

    app.use(
        express.static(
            path.join(__dirname,"../public")
        )
    );

    app.get("/",(req,res)=>{

        res.sendFile(
            path.join(
                __dirname,
                "../public/index.html"
            )
        );

    });


    /*
    ------------------------------------
    Health
    ------------------------------------
    */

    app.get("/health", (req, res) => {

        res.json({

            service: observerState.service,

            status: observerState.status,

            uptime: process.uptime(),

            startedAt: observerState.startedAt

        });

    });

    /*
    ------------------------------------
    Heartbeat
    ------------------------------------
    */

    app.post("/heartbeat", async (req, res) => {

        console.log(
            "[ISCAN HEARTBEAT]",
            req.body
        );

        res.json({

            received: true,

            observer: observerState.service

        });

    });

    const PORT =
        process.env.OBSERVER_PORT || 4000;

    app.listen(PORT, () => {

        console.log("");

        console.log("=================================");

        console.log("");

        console.log(
            `Observer listening on ${PORT}`
        );

        console.log("");

        console.log("=================================");

        console.log("");

    });

}

module.exports = {

    startServer

};
