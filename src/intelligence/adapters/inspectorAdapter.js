import Inspector from "../../models/inspectorModel.js";


class InspectorAdapter {


    async collect(){


        const recent =
            await Inspector.find()
            .sort({
                createdAt:-1
            })
            .limit(100);



        const total =
            recent.length;



        const failed =
            recent.filter(
                x=>x.status==="FAILED"
            ).length;



        const running =
            recent.filter(
                x=>x.status==="RUNNING"
            ).length;



        const success =
            recent.filter(
                x=>x.status==="SUCCESS"
            ).length;



        return {

            node:"pipelineInspector",

            type:"inspector",

            status:
                failed > 0
                ? "WARNING"
                : "ONLINE",


            metrics:{

                totalFlows:total,

                running,

                success,

                failed,

                failureRate:
                    total
                    ?
                    (failed / total) * 100
                    :
                    0

            }

        };


    }


}


export default new InspectorAdapter();
