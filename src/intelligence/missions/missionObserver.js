import brainBus from "../../brainbus/brainBus.js";
import missionEngine from "./missionEngine.js";

class MissionObserver {

    constructor() {

        this.running = new Map();

    }

    startMission(id, context = {}) {

        const state =
            missionEngine.start(id, context);

        if (!state.ok)
            return state;

        this.running.set(
            state.missionId,
            state
        );

        console.log(
            `[Mission] Started ${state.missionId}`
        );

        return state;

    }

    completeStage(missionId, stageId) {

        const state =
            this.running.get(missionId);

        if (!state)
            return;

        missionEngine.complete(
            state,
            stageId
        );

        console.log(
            `[Mission] ${missionId} -> ${stageId}`
        );

        if (state.finished) {

            console.log(
                `[Mission] ${missionId} completed`
            );

            this.running.delete(
                missionId
            );

        }

    }

    wire() {

        brainBus.on(
            "mission.started",
            payload => {

                this.startMission(
                    payload.missionId,
                    payload
                );

            }
        );

        brainBus.on(
            "mission.stage.completed",
            payload => {

                this.completeStage(
                    payload.missionId,
                    payload.stageId
                );

            }
        );

        console.log(
            "[MissionObserver] Listening."
        );

    }

}

export default new MissionObserver();
