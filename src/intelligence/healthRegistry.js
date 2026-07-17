class HealthRegistry {

    constructor(){

        this.nodes = new Map();

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

        }


        return this.nodes.get(node);

    }



    report({

        node,
        type="unknown",
        status="ONLINE",
        metrics={},
        error=null

    }){


        const current =
            this.nodes.get(node) || {};


        const updated={

            node,

            type:
                type ||
                current.type ||
                "unknown",

            status,

            metrics:{
                ...(current.metrics || {}),
                ...metrics
            },

            error,

            lastSeen:new Date()

        };


        this.nodes.set(
            node,
            updated
        );


        return updated;

    }



    getNode(node){

        return this.nodes.get(node);

    }



    getAll(){

        return Array.from(
            this.nodes.values()
        );

    }



    getOverallStatus(){

        const nodes=this.getAll();


        if(
            nodes.some(
                n=>n.status==="CRITICAL"
            )
        ){
            return "CRITICAL";
        }


        if(
            nodes.some(
                n=>n.status==="WARNING"
            )
        ){
            return "WARNING";
        }


        return "HEALTHY";

    }



    snapshot(){

        return {

            overallStatus:
                this.getOverallStatus(),

            nodes:
                this.getAll()

        };

    }


}


export default new HealthRegistry();
