/**
 * ISCAN External Observer
 *
 * Runtime State
 *
 * Shared in-memory state consumed by:
 *  - Dashboard API
 *  - Process Monitor
 *  - Recovery Engine
 *  - Database Monitor
 *  - Queue Monitor
 */

module.exports = {

    observer: {

        status: "STARTING",

        startedAt: new Date()

    },

    process: {

        running: false,

        pid: null,

        restartCount: 0,

        lastRecovery: null

    },

    services: {

        database: "UNKNOWN",

        queue: "UNKNOWN",

        heartbeat: "UNKNOWN"

    },

    events: []

};
