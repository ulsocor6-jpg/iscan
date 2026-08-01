import architectureLoader from "./architecture/architectureLoader.js";
import architectureKnowledgeGraph from "./architecture/architectureKnowledgeGraph.js";

import missionLoader from "./missions/missionLoader.js";
import missionRegistry from "./missions/missionRegistry.js";

import contractLoader from "./contracts/contractLoader.js";
import contractValidator from "./contracts/contractValidator.js";

class KnowledgeBootstrap {

    async start() {

        console.log(
            "[Knowledge] Initializing..."
        );

        await architectureLoader.load();

        await missionLoader.load();

        await contractLoader.load();

        const validation =
            contractValidator.validateAll();

        const failed =
            validation.filter(v => !v.valid);

        console.log(
            `[Knowledge] Components : ${architectureKnowledgeGraph.list().length}`
        );

        console.log(
            `[Knowledge] Missions   : ${missionRegistry.list().length}`
        );

        console.log(
            `[Knowledge] Contracts  : ${contractLoader.list().length}`
        );

        console.log(
            `[Knowledge] Invalid    : ${failed.length}`
        );

        if (failed.length) {

            console.warn(
                "[Knowledge] Validation failures:"
            );

            for (const item of failed) {

                console.warn(
                    " -",
                    item.id,
                    item.errors.join(", ")
                );

            }

        }

        console.log(
            "[Knowledge] Ready."
        );

    }

}

export default new KnowledgeBootstrap();
