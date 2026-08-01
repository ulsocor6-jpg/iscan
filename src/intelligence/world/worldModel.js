class WorldModel {

    constructor() {

        this.state = new Map();

    }

    set(key, value) {

        this.state.set(key, {

            updatedAt: Date.now(),

            value

        });

    }

    get(key) {

        return this.state.get(key)?.value;

    }

    has(key) {

        return this.state.has(key);

    }

    delete(key) {

        this.state.delete(key);

    }

    snapshot() {

        return Object.fromEntries(

            [...this.state.entries()].map(

                ([key, record]) => [

                    key,

                    record.value

                ]

            )

        );

    }

    keys() {

        return [...this.state.keys()];

    }

}

export default new WorldModel();
