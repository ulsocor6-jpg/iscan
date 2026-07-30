import autoCreditMission
from "./definitions/autoCreditMission.js";

class MissionRegistry {

    constructor() {

        this.missions = new Map();

        this.register(autoCreditMission);

    }

    register(mission) {

        this.missions.set(
            mission.id,
            mission
        );

    }

    get(id) {

        return this.missions.get(id);

    }

    list() {

        return [...this.missions.values()];

    }

    has(id) {

        return this.missions.has(id);

    }

}

export default new MissionRegistry();
