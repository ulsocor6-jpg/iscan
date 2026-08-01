import worldModel from "./worldModel.js";

class WorldExpectationEngine {

    constructor() {

        this.expectations = new Map();

    }

    expect(topic, expected = {}) {

        this.expectations.set(topic, {

            expected,

            createdAt: Date.now(),

            satisfied: false

        });

    }

    satisfy(topic, actual = {}) {

        const expectation =
            this.expectations.get(topic);

        if (!expectation)
            return false;

        expectation.actual = actual;

        expectation.satisfied = true;

        expectation.completedAt = Date.now();

        worldModel.set(

            `expectation.${topic}`,

            expectation

        );

        return true;

    }

    pending() {

        return [

            ...this.expectations.entries()

        ].filter(

            ([, value]) => !value.satisfied

        );

    }

    completed() {

        return [

            ...this.expectations.entries()

        ].filter(

            ([, value]) => value.satisfied

        );

    }

}

export default new WorldExpectationEngine();
