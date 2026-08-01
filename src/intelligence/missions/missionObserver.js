import brainBus from "../../brainbus/brainBus.js";
import missionEngine from "./missionEngine.js";
import missionControlPublisher from "../missionControl/missionControlPublisher.js";

class MissionObserver {

    constructor(){

        this.running=new Map();

    }

    startMission(id,context={}){

        const state=missionEngine.start(id,context);

        if(!state.ok)
            return state;

        this.running.set(state.missionId,state);

        missionControlPublisher.publish({

            component:"MissionEngine",

            stage:"MISSION_START",

            type:state.missionId,

            session:{
                id:state.missionId
            },

            metadata:context,

            message:`Mission ${state.missionId} started`

        });

        return state;

    }

    completeStage(missionId,stageId){

        const state=this.running.get(missionId);

        if(!state)
            return;

        missionEngine.complete(state,stageId);

        missionControlPublisher.publish({

            component:"MissionEngine",

            stage:stageId,

            type:missionId,

            session:{
                id:missionId
            },

            message:`${stageId} completed`

        });

        if(state.finished){

            missionControlPublisher.publish({

                component:"MissionEngine",

                stage:"MISSION_FINISHED",

                type:missionId,

                session:{
                    id:missionId
                },

                message:`Mission ${missionId} finished`

            });

            this.running.delete(missionId);

        }

    }

    wire(){

        brainBus.on(
            "mission.started",
            payload=>{

                this.startMission(
                    payload.missionId,
                    payload
                );

            }
        );

        brainBus.on(
            "mission.stage.completed",
            payload=>{

                this.completeStage(
                    payload.missionId,
                    payload.stageId
                );

            }
        );

    }

    snapshot(){

        return{

            running:Array.from(this.running.values())

        };

    }

}

export default new MissionObserver();
