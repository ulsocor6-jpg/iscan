import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";
import descriptorValidator from "../descriptors/descriptorValidator.js";

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

                const validation =
                    descriptorValidator.validate(descriptor);

                if (!validation.valid) {

                    console.warn(
                        "[ArchitectureLoader] Invalid descriptor:",
                        descriptor.name || path.basename(file)
                    );

                    for (const err of validation.errors)
                        console.warn("   •", err);

                    return;

                }

                architectureKnowledgeGraph.register({

                    ...descriptor,

                    id:
                        descriptor.id ||
                        descriptor.name ||
                        path.basename(file),

                    previous:
                        descriptor.previous ||
                        descriptor.dependsOn ||
                        [],

                    next:
                        descriptor.next ||
                        []

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
