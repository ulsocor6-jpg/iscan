import { useEffect, useState } from "react";

export interface HealthNode {

    node:string;

    type:string;

    status:string;

    metrics:Record<string,any>;

    error:any;

    lastSeen:string;

}

export interface IntelligenceSnapshot{

    overallStatus:string;

    nodes:HealthNode[];

}

export default function useIntelligence(){

    const [loading,setLoading]=useState(true);

    const [snapshot,setSnapshot]=
        useState<IntelligenceSnapshot|null>(null);

    const [error,setError]=
        useState("");

    async function load(){

        try{

            const res =
                await fetch(
                    "/api/v1/intelligence/health",
                    {
                        credentials:"include"
                    }
                );

            const json =
                await res.json();

            if(json.success){

                setSnapshot(
                    json.data
                );

                setError("");

            }else{

                setError(
                    json.message ||
                    "Failed to load intelligence"
                );

            }

        }catch(err:any){

            setError(
                err.message
            );

        }finally{

            setLoading(false);

        }

    }

    useEffect(()=>{

        load();

        const timer =
            setInterval(
                load,
                5000
            );

        return ()=>clearInterval(timer);

    },[]);

    return{

        loading,

        snapshot,

        error,

        refresh:load

    };

}
