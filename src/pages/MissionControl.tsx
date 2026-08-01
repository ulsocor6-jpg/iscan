import MissionControlLayout from "../components/mission-control/MissionControlLayout";
import ArchitectureTree from "../components/mission-control/ArchitectureTree";
import { MissionControlProvider } from "../context/MissionControlContext";

export default function MissionControl(){

    return(

        <MissionControlProvider>

            <MissionControlLayout>

                <ArchitectureTree/>

            </MissionControlLayout>

        </MissionControlProvider>

    );

}
