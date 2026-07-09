class WorkScheduler {

    constructor() {

        this.running = new Map();

        this.queue = [];

        this.processing = false;

        this.maxConcurrent = 4;

    }

    /*
    ==========================================

    Queue Work

    ==========================================
    */

    schedule(workerName, event, handler) {

        const jobId = `${workerName}:${event._id}`;

        if (this.running.has(jobId)) {

            return false;

        }

        this.queue.push({

            id: jobId,

            workerName,

            event,

            handler,

            retries: 0

        });

        this.process();

        return true;

    }

    /*
    ==========================================

    Process Queue

    ==========================================
    */

    async process() {

        if (this.processing) {

            return;

        }

        this.processing = true;

        while (this.queue.length) {

            while (

                this.running.size < this.maxConcurrent &&

                this.queue.length

            ) {

                const job = this.queue.shift();

                this.execute(job);

            }

            await new Promise(

                resolve => setTimeout(resolve, 50)

            );

        }

        this.processing = false;

    }

    /*
    ==========================================

    Execute One Job

    ==========================================
    */

    async execute(job) {

        this.running.set(job.id, true);

        try {

            console.log(

                `[Scheduler] ${job.workerName}`,

                job.event.txHash

            );

            await job.handler(job.event);

        }

        catch (err) {

            console.error(

                `[Scheduler Error] ${job.workerName}`,

                err.message

            );

            if (job.retries < 5) {

                job.retries++;

                this.queue.push(job);

            }

        }

        finally {

            this.running.delete(job.id);

        }

    }

    /*
    ==========================================

    Stats

    ==========================================
    */

    stats() {

        return {

            queued: this.queue.length,

            running: this.running.size,

            maxConcurrent: this.maxConcurrent

        };

    }

}

export default new WorkScheduler();
