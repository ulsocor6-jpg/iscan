import { alertNodeStatusChange } from "../services/telegramAlertService.js";
import { classifyError } from "./rootCauseClassifier.js";
import missionControlPublisher from "./missionControl/missionControlPublisher.js";

class HealthRegistry {

    constructor(){
        this.nodes=new Map();
    }

    registerNode({
        node,
        type="unknown"
    }){

        if(!this.nodes.has(node)){

            this.nodes.set(node,{
                node,
                type,
                status:"ONLINE",
                metrics:{},
                error:null,
                lastSeen:new Date()
            });

            missionControlPublisher.publish({
                component:node,
                stage:node,
                type:"NODE_REGISTERED",
                level:"INFO",
                metadata:{type},
                message:`${node} registered`
            });

        }

        return this.nodes.get(node);

    }

    report({

        node,

        type,

        status="ONLINE",

        metrics={},

        error=null

    }){

        const current=this.nodes.get(node)||{};

        const previousStatus=current.status||null;

        const diagnosis=

            error&&(status==="WARNING"||status==="CRITICAL")

                ? classifyError(error,{
                    node,
                    type:type||current.type
                })

                : null;

        const updated={

            node,

            type:type||current.type||"unknown",

            status,

            metrics:{
                ...(current.metrics||{}),
                ...metrics
            },

            error,

            diagnosis,

            lastSeen:new Date()

        };

        this.nodes.set(node,updated);

        missionControlPublisher.publish({

            component:node,

            stage:node,

            type:"HEALTH_UPDATE",

            level:status,

            metadata:{

                type:updated.type,

                metrics:updated.metrics,

                diagnosis,

                error

            },

            message:`${node} is ${status}`

        });

        if(previousStatus&&previousStatus!==status){

            alertNodeStatusChange(updated,previousStatus)

            .catch(err=>

                console.error(

                    "[HealthRegistry]",

                    err.message

                )

            );

        }

        return updated;

    }

    getNode(node){

        return this.nodes.get(node);

    }

    getAll(){

        return Array.from(this.nodes.values());

    }

    getOverallStatus(){

        const nodes=this.getAll();

        if(nodes.some(n=>n.status==="CRITICAL"))
            return "CRITICAL";

        if(nodes.some(n=>n.status==="WARNING"))
            return "WARNING";

        return "HEALTHY";

    }

    snapshot(){

        return{

            overallStatus:this.getOverallStatus(),

            nodes:this.getAll()

        };

    }

}

export default new HealthRegistry();
