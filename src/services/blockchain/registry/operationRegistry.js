class OperationRegistry {

    constructor() {

        this.operations = new Map();

    }

    /*
    |--------------------------------------------------------------------------
    | Register Operation
    |--------------------------------------------------------------------------
    */

    register(operation) {

        if (!operation.id) {
            throw new Error("Operation id is required.");
        }

        operation.state ??= "WAITING";
        operation.createdAt ??= new Date();

        this.operations.set(operation.id, operation);

        return operation;

    }

    /*
    |--------------------------------------------------------------------------
    | Find by ID
    |--------------------------------------------------------------------------
    */

    get(id) {

        return this.operations.get(id) || null;

    }

    /*
    |--------------------------------------------------------------------------
    | Update
    |--------------------------------------------------------------------------
    */

    update(id, updates = {}) {

        const operation = this.operations.get(id);

        if (!operation) return null;

        Object.assign(operation, updates);

        return operation;

    }

    /*
    |--------------------------------------------------------------------------
    | Remove
    |--------------------------------------------------------------------------
    */

    remove(id) {

        this.operations.delete(id);

    }

    /*
    |--------------------------------------------------------------------------
    | Pending Operations
    |--------------------------------------------------------------------------
    */

    pending() {

        return [...this.operations.values()]
            .filter(op => op.state === "WAITING");

    }

    /*
    |--------------------------------------------------------------------------
    | Match Blockchain Event
    |--------------------------------------------------------------------------
    */

    match(event) {

        for (const operation of this.pending()) {

            if (
                operation.chain !== event.chain
            ) continue;

            if (
                operation.token !== event.token
            ) continue;

            if (
                operation.expectedTo &&
                operation.expectedTo !== event.to
            ) continue;

            if (
                operation.expectedFrom &&
                operation.expectedFrom !== event.from
            ) continue;

            if (
                operation.amount &&
                operation.amount !== event.value
            ) continue;

            return operation;

        }

        return null;

    }

    /*
    |--------------------------------------------------------------------------
    | Statistics
    |--------------------------------------------------------------------------
    */

    stats() {

        const waiting = this.pending().length;

        const total = this.operations.size;

        return {

            total,

            waiting

        };

    }

}

export default new OperationRegistry();
