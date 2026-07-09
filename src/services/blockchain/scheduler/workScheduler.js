import inspector from "../inspector/blockchainInspector.js";

class WorkScheduler {

    constructor() {

        this.running = false;

        this.interval = null;

        this.workers = [];

    }

    register(worker) {

        this.workers.push(worker);

    }

    start() {

        if (this.running) {

            return;

        }

        this.running = true;

        console.log(
            `[WorkScheduler] Started (${this.workers.length} workers)`
        );

        this.interval = setInterval(

            () => this.tick(),

            1000

        );

    }

    stop() {

        clearInterval(this.interval);

        this.running = false;

    }

    async tick() {

        for (const worker of this.workers) {

            try {

                await worker.process();

            }

            catch (err) {

                inspector.error(

                    "WorkScheduler",

                    err.message,

                    {

                        worker:

                            worker.constructor.name

                    }

                );

            }

        }

    }

}

export default new WorkScheduler();
