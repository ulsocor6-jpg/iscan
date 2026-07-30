import missionLoader from "./missionLoader.js";
import missionObserver from "./missionObserver.js";
import missionRegistry from "./missionRegistry.js";

class MissionBootstrap {

    async start() {

        console.log(
            "[Mission] Loading mission definitions..."
        );

        await missionLoader.load();

        console.log(
            `[Mission] ${missionRegistry.list().length} mission(s) loaded.`
        );

        missionObserver.wire();

        console.log(
            "[Mission] Intelligence Ready."
        );

    }

}

export default new MissionBootstrap();
