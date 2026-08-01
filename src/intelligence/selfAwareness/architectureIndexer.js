import fs from "fs";

import codeDiscoveryEngine from "./codeDiscoveryEngine.js";

class ArchitectureIndexer {

    constructor() {

        this.index = new Map();

    }

    build(root = "src") {

        this.index.clear();

        const files =
            codeDiscoveryEngine.discover(root);

        for (const file of files) {

            const source =
                fs.readFileSync(
                    file.path,
                    "utf8"
                );

            this.index.set(
                file.path,
                this.analyze(file, source)
            );

        }

        return this.index;

    }

    analyze(file, source) {

        return {

            id:
                file.path,

            file:
                file,

            imports:
                this.matchAll(
                    source,
                    /import\s+.*?from\s+["'](.+?)["']/g
                ),

            exports:
                this.matchAll(
                    source,
                    /export\s+(?:default\s+)?(?:class|function|const|let|var)?\s*([A-Za-z0-9_]*)/g
                ),

            classes:
                this.matchAll(
                    source,
                    /class\s+([A-Za-z0-9_]+)/g
                ),

            functions:
                this.matchAll(
                    source,
                    /(?:async\s+)?function\s+([A-Za-z0-9_]+)/g
                ),

            methods:
                this.matchAll(
                    source,
                    /^\s*([A-Za-z0-9_]+)\s*\(/gm
                ),

            brainBusPublish:

                this.matchAll(
                    source,
                    /brainBus\.(?:emit|publish)\(["'](.+?)["']/g
                ),

            brainBusSubscribe:

                this.matchAll(
                    source,
                    /brainBus\.(?:on|subscribe)\(["'](.+?)["']/g
                ),

            descriptors:

                source.includes("descriptor"),

            contracts:

                source.includes("contract"),

            missions:

                source.includes("mission"),

            lines:

                source.split("\n").length

        };

    }

    matchAll(source, regex) {

        const results = [];

        let match;

        while ((match = regex.exec(source))) {

            if (match[1])

                results.push(match[1]);

        }

        return [...new Set(results)];

    }

    get(file) {

        return this.index.get(file);

    }

    list() {

        return [...this.index.values()];

    }

}

export default new ArchitectureIndexer();
