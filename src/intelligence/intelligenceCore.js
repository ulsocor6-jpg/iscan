import healthRegistry from "./healthRegistry.js";
import SystemHealth from "./models/systemHealthModel.js";
import inspectorAdapter from "./adapters/inspectorAdapter.js";


class IntelligenceCore {


    constructor(){

        this.interval=null;

        this.started=false;

    }



    async start(){

        if(this.started)
            return;


        this.started=true;


        console.log(
            "[INTELLIGENCE] Core started"
        );


        this.registerNode({

            node:"intelligenceCore",

            type:"system"

        });


        this.report({

            node:"intelligenceCore",

            status:"ONLINE",

            metrics:{
                startedAt:new Date()
            }

        });


        this.interval=setInterval(
    async()=>{


        await this.collectInspectors();


        await this.saveSnapshot();


    },
    60000
);


    }




    registerNode(data){

        return healthRegistry.registerNode(
            data
        );

    }




    report(data){

        const result =
            healthRegistry.report(
                data
            );


        return result;

    }




    getHealth(){

        return healthRegistry.snapshot();

    }


    async collectInspectors(){

        const reports = [];

        try{

            reports.push(
                await inspectorAdapter.collect()
            );

        }catch(err){

            console.error(
                "[INTELLIGENCE] Inspector adapter failed:",
                err.message
            );

        }


        for(const report of reports){

            if(report){

                this.report(report);

            }

        }

    }

    async saveSnapshot(){

        const snapshot =
            healthRegistry.snapshot();


        await SystemHealth.create(
            snapshot
        );


        return snapshot;

    }



    async stop(){

        if(this.interval){

            clearInterval(
                this.interval
            );

        }


        this.started=false;


        console.log(
            "[INTELLIGENCE] Core stopped"
        );

    }


}


export default new IntelligenceCore();
