import systemSnapshotService from "./systemSnapshotService.js";
import missionControlState from "./missionControlState.js";

import runtimeArchitectureObserver from "../architecture/runtimeArchitectureObserver.js";
import executionGraphSnapshotService from "../correlation/executionGraphSnapshotService.js";
import healthRegistry from "../healthRegistry.js";
import missionObserver from "../missions/missionObserver.js";

class MissionControlSnapshotService {

    getRuntimeSnapshot(){

        return {

            active:
                Array.from(
                    runtimeArchitectureObserver.active.entries()
                ),

            history:
                Array.from(
                    runtimeArchitectureObserver.history.entries()
                )

        };

    }

    getMissionSnapshot(){

        return {

            running:
                Array.from(
                    missionObserver.running.values()
                )

        };

    }

    getSnapshot(){

        return{

            generatedAt:
                new Date().toISOString(),

            system:
                systemSnapshotService.getSnapshot(),

            runtime:
                this.getRuntimeSnapshot(),

            health:
                healthRegistry.snapshot(),

            missions:
                this.getMissionSnapshot(),

            execution:
                executionGraphSnapshotService.getSnapshot(),

            state:
                missionControlState.snapshot()

        };

    }

}

export default new MissionControlSnapshotService();
