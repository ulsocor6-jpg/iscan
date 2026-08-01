import architectureLoader from "./architectureLoader.js";
import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";
import architectureBrainSubscriber from "./architectureBrainSubscriber.js";

class ArchitectureBootstrap {

    async start() {

        console.log(
            "[Architecture] Loading knowledge graph..."
        );

        await architectureLoader.load();

        console.log(
            `[Architecture] ${architectureKnowledgeGraph.list().length} components loaded.`
        );

        architectureBrainSubscriber.start();

        console.log(
            "[Architecture] Runtime observer online."
        );

    }

}

export default new ArchitectureBootstrap();
