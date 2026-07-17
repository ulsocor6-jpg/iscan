class BaseExecutor {

    constructor(name) {

        this.name = name;

        this.started = false;

    }

    async run(payload) {

        const startedAt = Date.now();

        try {

            this.beforeExecute(payload);

            const result = await this.execute(payload);

            await this.afterExecute(

                payload,

                result

            );

            console.log(

                `[${this.name}] completed in ${Date.now() - startedAt}ms`

            );

            return result;

        }

        catch (err) {

            await this.onError(

                payload,

                err

            );

            throw err;

        }

    }

    beforeExecute() {}

    afterExecute() {}

    async onError(payload, err) {

        console.error(

            `[${this.name}]`,

            err

        );

    }

    async execute() {

        throw new Error(

            "execute() not implemented."

        );

    }

}

export default BaseExecutor;
