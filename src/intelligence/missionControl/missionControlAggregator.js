import missionControlState from "./missionControlState.js";

class MissionControlAggregator {

    process(event = {}) {

        this.updateSystem(event);

        this.updateActivity(event);

        this.updateExecution(event);

        this.updateComponents(event);

        this.updateTimeline(event);

        return missionControlState.getState();

    }

    updateSystem(event) {

        missionControlState.update("system", {

            lastEvent: event.type || event.stage,

            lastUpdate: new Date(),

            status: "ONLINE"

        });

    }

    updateActivity(event) {

        missionControlState.update("activity", {

            onlineUsers: event.metadata?.onlineUsers,

            activeUser: event.metadata?.userId,

            currentStage: event.stage,

            currentMission: event.type

        });

    }

    updateExecution(event) {

        missionControlState.update("execution", {

            sessionId:

                event.session?.id ||

                event.sessionId ||

                null,

            stage: event.stage,

            status: event.level,

            mission: event.type

        });

    }

    updateComponents(event) {

        if (!event.stage) {

            return;

        }

        const components =

            missionControlState.get("components") || {};

        components[event.stage] = {

            state: "ONLINE",

            lastEvent:

                event.type ||

                event.message ||

                null,

            updatedAt: new Date()

        };

        missionControlState.set(

            "components",

            components

        );

    }

    updateTimeline(event) {

        missionControlState.appendTimeline({

            stage: event.stage,

            type: event.type,

            message: event.message,

            level: event.level,

            session:

                event.session?.id ||

                event.sessionId ||

                null

        });

    }

}

export default new MissionControlAggregator();
