class SystemSnapshotService {

    constructor() {

        this.snapshot = {
            status: "STARTING",
            startedAt: new Date().toISOString(),
            uptime: 0,
            mongodb: "UNKNOWN",
            brainBus: "UNKNOWN",
            consensus: "UNKNOWN",
            activity: "UNKNOWN",
            missionEngine: "UNKNOWN",
            architecture: "UNKNOWN"
        };

        setInterval(() => {
            this.snapshot.uptime = Math.floor(process.uptime());
        }, 1000);

    }

    set(key, value) {

        this.snapshot[key] = value;

    }

    update(values = {}) {

        Object.assign(this.snapshot, values);

    }

    getSnapshot() {

        return structuredClone(this.snapshot);

    }

}

export default new SystemSnapshotService();
