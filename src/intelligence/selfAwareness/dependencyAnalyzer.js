import architectureIndexer from "./architectureIndexer.js";
import path from "path";

class DependencyAnalyzer {

    constructor() {

        this.graph = new Map();

    }

    build(root = "src") {

        this.graph.clear();

        architectureIndexer.build(root);

        for (const node of architectureIndexer.list()) {

            this.graph.set(

                node.id,

                {

                    file: node.file,

                    imports: node.imports,

                    importedBy: [],

                    brainBusPublish:
                        node.brainBusPublish,

                    brainBusSubscribe:
                        node.brainBusSubscribe

                }

            );

        }

        for (const [id, info] of this.graph) {

            for (const imported of info.imports) {

                if (!imported.startsWith(".") && !imported.startsWith("/")) {

                    continue;

                }

                const resolved = path
                    .normalize(path.join(path.dirname(id), imported))
                    .split(path.sep)
                    .join("/");

                const candidates = [resolved, resolved + ".js"];

                for (const [targetId] of this.graph) {

                    if (candidates.includes(targetId)) {

                        this.graph

                            .get(targetId)

                            .importedBy

                            .push(id);

                    }

                }

            }

        }

        return this.graph;

    }

    get(file) {

        return this.graph.get(file);

    }

    dependencies(file) {

        return this.graph.get(file)?.imports || [];

    }

    dependents(file) {

        return this.graph.get(file)?.importedBy || [];

    }

    orphanFiles() {

        return [

            ...this.graph.entries()

        ]

        .filter(

            ([, node]) =>

                node.importedBy.length === 0

        )

        .map(

            ([id]) => id

        );

    }

    circularDependencies() {

        const cycles = [];

        for (const [id, node] of this.graph) {

            if (

                node.imports.includes(id)

            ) {

                cycles.push(id);

            }

        }

        return cycles;

    }

    list() {

        return [

            ...this.graph.values()

        ];

    }

}

export default new DependencyAnalyzer();
