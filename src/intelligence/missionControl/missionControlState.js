class MissionControlState {

    constructor() {

        this.state = {

            system: {},

            activity: {},

            treasury: {},

            incidents: {},

            execution: {},

            watchers: {},

            components: {},

            intelligence: {},

            timeline: []

        };

    }

    set(section, value) {

        this.state[section] = value;

    }

    update(section, partial = {}) {

        this.state[section] = {

            ...(this.state[section] || {}),

            ...partial

        };

    }

    appendTimeline(entry = {}) {

        this.state.timeline.unshift({

            timestamp: new Date(),

            ...entry

        });

        this.state.timeline =
            this.state.timeline.slice(0, 500);

    }

    get(section) {

        return this.state[section];

    }
    getState() {

        return structuredClone(this.state);

    }

    snapshot() {

        return this.getState();

    }
}

export default new MissionControlState();
