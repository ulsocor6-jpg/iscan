import React,{createContext,useContext} from "react";
import useMissionControl from "../hooks/useMissionControl";

type MissionContextType={
    snapshot:any;
    loading:boolean;
};

const MissionControlContext=createContext<MissionContextType>({
    snapshot:null,
    loading:true
});

export function MissionControlProvider({
    children
}:{children:React.ReactNode}){

    const mission=useMissionControl();

    return(
        <MissionControlContext.Provider value={mission}>
            {children}
        </MissionControlContext.Provider>
    );

}

export function useMission(){

    return useContext(MissionControlContext);

}
