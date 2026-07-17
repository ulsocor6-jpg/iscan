import os from "os";
import intelligenceCore from "../intelligence/intelligenceCore.js";


class OperatorService {


    getRuntime(){

        return {

            uptime:
                process.uptime(),

            pid:
                process.pid,

            nodeVersion:
                process.version,


            memory:{

                rss:
                    process.memoryUsage().rss,

                heapUsed:
                    process.memoryUsage().heapUsed,

                heapTotal:
                    process.memoryUsage().heapTotal

            },


            cpu:{

                load:
                    os.loadavg()

            },


            system:{

                platform:
                    os.platform(),

                hostname:
                    os.hostname(),

                cpus:
                    os.cpus().length

            },


            health:
                intelligenceCore.getHealth(),


            timestamp:
                new Date()

        };


    }



    async restart(){

        return {

            accepted:true,

            message:
            "Restart request queued. Supervisor integration pending."

        };

    }



    getWorkers(){

        const health =
            intelligenceCore.getHealth();


        return health.nodes.map(node=>({

            name:
                node.node,

            type:
                node.type,

            status:
                node.status,

            lastSeen:
                node.lastSeen,

            error:
                node.error

        }));

    }



}



export default new OperatorService();
