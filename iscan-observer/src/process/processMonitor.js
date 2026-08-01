/**
 * ISCAN External Observer
 *
 * Process Monitor
 *
 * Responsibilities
 * ----------------
 * - Monitor ISCAN process
 * - Detect crashes
 * - Trigger recovery
 */

const processManager =
require("./processManager");

let recoveryInProgress = false;

function startProcessMonitor() {

    console.log(
        "ISCAN Process Monitor started"
    );

    setInterval(async () => {

        const running =
        processManager.isRunning();

        if (running) {

            recoveryInProgress = false;

            return;

        }

        if (recoveryInProgress) {

            return;

        }

        recoveryInProgress = true;

        console.log("");
        console.log("=================================");
        console.log(" ISCANN SERVER OFFLINE");
        console.log(" Starting automatic recovery...");
        console.log("=================================");
        console.log("");

        const result =
        processManager.restart();

        console.log(
            "Restart Result:",
            result
        );

    }, 5000);

}

module.exports = {

    startProcessMonitor

};
