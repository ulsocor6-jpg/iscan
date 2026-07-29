import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";

class ArchitectureLoader {

    async load(root = "src") {

        let loaded = 0;

        await this.walk(root, async (file) => {

            if (!file.endsWith(".js")) return;

            try {

                const mod = await import(
                    pathToFileURL(path.resolve(file)).href
                );

                const descriptor =
                    mod.default?.descriptor ||
                    mod.descriptor ||
                    mod.default?.constructor?.descriptor;

                if (!descriptor) return;

                architectureKnowledgeGraph.register({

                    id:
                        descriptor.name ||
                        path.basename(file),

                    name:
                        descriptor.name ||
                        path.basename(file),

                    type:
                        descriptor.type || "service",

                    description:
                        descriptor.description || "",

                    dependsOn:
                        descriptor.dependsOn || [],

                    provides:
                        descriptor.provides || [],

                    consumes:
                        descriptor.inputs || [],

                    produces:
                        descriptor.outputs || [],

                    previous:
                        descriptor.dependsOn || [],

                    next: []

                });

                loaded++;

            } catch (err) {

                // Ignore modules requiring runtime state

            }

        });

        console.log(
            `[ArchitectureLoader] Loaded ${loaded} architecture descriptors.`
        );

    }

    async walk(dir, cb) {

        for (const file of fs.readdirSync(dir)) {

            const full = path.join(dir, file);

            const stat = fs.statSync(full);

            if (stat.isDirectory()) {

                await this.walk(full, cb);

            } else {

                await cb(full);

            }

        }

    }

}

export default new ArchitectureLoader();
