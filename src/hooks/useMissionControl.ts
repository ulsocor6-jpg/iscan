import { useEffect, useState } from "react";
import { fetchMissionSnapshot } from "../api/mission-control/missionControlApi";

export default function useMissionControl(){

    const [snapshot,setSnapshot]=useState<any>(null);
    const [loading,setLoading]=useState(true);

    async function load(){

        try{

            const data=await fetchMissionSnapshot();
            setSnapshot(data);

        }finally{

            setLoading(false);

        }

    }

    useEffect(()=>{

        load();

        const timer=setInterval(load,1000);

        return ()=>clearInterval(timer);

    },[]);

    return{
        snapshot,
        loading
    }

}
