/**
 * ISCAN External Observer
 *
 * Process Manager
 *
 * Responsibilities
 * ----------------
 * - Own the ISCAN Core process
 * - Start / Stop / Restart
 * - Detect if running
 * - Expose runtime state
 */

const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

let child = null;

const state = {
    status: "STOPPED",
    pid: null,
    startedAt: null,
    exitCode: null,
    signal: null,
    lastError: null,
    restartCount: 0
};

function start() {

    if (child && !child.killed) {
        return child;
    }

    console.log("[PROCESS] Starting ISCAN Core...");

    child = spawn(
        "node",
        ["server.js"],
        {
            cwd: ROOT,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"]
        }
    );

    state.status = "STARTING";
    state.pid = child.pid;
    state.startedAt = new Date();
    state.exitCode = null;
    state.signal = null;
    state.lastError = null;

    child.stdout.on("data", data => {
        process.stdout.write("[ISCAN] " + data.toString());
    });

    child.stderr.on("data", data => {

        state.lastError = data.toString();

        process.stderr.write(
            "[ISCAN ERROR] " +
            data.toString()
        );

    });

    child.on("spawn", () => {

        state.status = "RUNNING";

        console.log(
            "[PROCESS] ISCAN running. PID:",
            child.pid
        );

    });

    child.on("exit", (code, signal) => {

        console.log(
            "[PROCESS] ISCAN exited",
            code,
            signal
        );

        state.status = "STOPPED";
        state.exitCode = code;
        state.signal = signal;

        child = null;

    });

    child.on("error", error => {

        state.status = "BOOT_FAILED";
        state.lastError = error.message;

        console.error(
            "[PROCESS]",
            error.message
        );

        child = null;

    });

    return child;

}

function stop() {

    if (child) {
        child.kill("SIGTERM");
    }

}

function restart() {

    state.restartCount++;

    stop();

    setTimeout(() => {

        start();

    }, 3000);

}

function isRunning() {

    return child && !child.killed;

}

function pid() {

    return child ? child.pid : null;

}

function runtimeState() {

    return state;

}

module.exports = {

    start,
    stop,
    restart,
    isRunning,
    pid,
    runtimeState

};
