import missionRegistry from "./missionRegistry.js";

class MissionEngine {

    start(id, context = {}) {

        const mission =
            missionRegistry.get(id);

        if (!mission) {

            return {
                ok: false,
                code: "MISSION_NOT_FOUND"
            };

        }

        return {

            ok: true,

            missionId: id,

            startedAt: new Date(),

            context,

            currentStage:

                mission.stages?.[0]?.id ||

                null,

            completed: [],

            pending:

                mission.stages?.map(

                    stage => stage.id

                ) || []

        };

    }

    next(state) {

        const mission =
            missionRegistry.get(
                state.missionId
            );

        if (!mission)
            return null;

        const completed =
            new Set(state.completed);

        return mission.stages.find(

            stage => !completed.has(stage.id)

        ) || null;

    }

    complete(state, stageId) {

        if (
            !state.completed.includes(stageId)
        ) {

            state.completed.push(stageId);

        }

        state.pending =
            state.pending.filter(
                s => s !== stageId
            );

        state.currentStage =
            this.next(state)?.id || null;

        state.finished =
            state.pending.length === 0;

        return state;

    }

}

const missionEngine = new MissionEngine();

missionEngine.descriptor = {
    id: "missionEngine",
    name: "Mission Engine",
    type: "scheduler",
    domain: "intelligence",
    description: "Runs registered missions from missionRegistry.",
    previous: [],
    next: [],
    dependsOn: ["missionRegistry"],
    criticality: "LOW",
    notes: "No live callers found outside src/intelligence/missions/ — zero missions registered, Mission Control is inert."
};

export default missionEngine;
