import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

import architectureKnowledgeGraph from "./architectureKnowledgeGraph.js";
import descriptorValidator from "../descriptors/descriptorValidator.js";

class ArchitectureLoader {

    constructor() {

        // A single hanging import() (e.g. a top-level await on an
        // unreachable Redis/queue connection) must not be able to stall
        // the entire architecture scan forever.
        this.importTimeoutMs = 3000;

    }

    async load(root = "src") {

        let loaded = 0;

        await this.walk(root, async (file) => {

            if (!file.endsWith(".js")) return;

            try {

                const mod = await Promise.race([

                    import(
                        pathToFileURL(path.resolve(file)).href
                    ),

                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error(`import timed out after ${this.importTimeoutMs}ms`)),
                            this.importTimeoutMs
                        )
                    )

                ]);

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

                if (String(err.message).includes("timed out")) {

                    console.warn(
                        `[ArchitectureLoader] Skipped ${file} — import() exceeded ${this.importTimeoutMs}ms (likely a top-level await on an unavailable connection, e.g. Redis).`
                    );

                }

                // Other errors: ignore modules requiring runtime state

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
