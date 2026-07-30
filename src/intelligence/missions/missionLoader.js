import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import missionRegistry from "./missionRegistry.js";

class MissionLoader {

    async load(root = "src/intelligence/missions/definitions") {

        let loaded = 0;

        if (!fs.existsSync(root)) {
            console.log("[MissionLoader] No mission definitions found.");
            return;
        }

        for (const file of fs.readdirSync(root)) {

            if (!file.endsWith(".js"))
                continue;

            try {

                const mod = await import(
                    pathToFileURL(
                        path.resolve(root, file)
                    ).href
                );

                const mission =
                    mod.default ||
                    mod.mission;

                if (!mission?.id)
                    continue;

                missionRegistry.register(
                    mission
                );

                loaded++;

            } catch (err) {

                console.warn(
                    "[MissionLoader]",
                    file,
                    err.message
                );

            }

        }

        console.log(
            `[MissionLoader] Loaded ${loaded} mission(s).`
        );

    }

}

export default new MissionLoader();
