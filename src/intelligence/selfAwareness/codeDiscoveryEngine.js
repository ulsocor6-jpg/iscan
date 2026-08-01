import fs from "fs";
import path from "path";

class CodeDiscoveryEngine {

    constructor() {

        this.files = [];

        this.extensions = new Set([
            ".js",
            ".mjs",
            ".cjs"
        ]);

        this.ignored = new Set([
            "node_modules",
            ".git",
            ".github",
            "coverage",
            "dist",
            "build",
            ".next",
            ".cache"
        ]);

    }

    discover(root = "src") {

        this.files = [];

        this.walk(root);

        return this.files;

    }

    walk(dir) {

        if (!fs.existsSync(dir))
            return;

        for (const entry of fs.readdirSync(dir)) {

            const full =
                path.join(dir, entry);

            const stat =
                fs.statSync(full);

            if (stat.isDirectory()) {

                if (this.ignored.has(entry))
                    continue;

                this.walk(full);

                continue;

            }

            if (
                !this.extensions.has(
                    path.extname(full)
                )
            ) continue;

            this.files.push({

                id:
                    full,

                path:
                    full,

                name:
                    path.basename(full),

                directory:
                    path.dirname(full),

                extension:
                    path.extname(full),

                size:
                    stat.size,

                modifiedAt:
                    stat.mtimeMs

            });

        }

    }

    list() {

        return this.files;

    }

    count() {

        return this.files.length;

    }

    exists(file) {

        return this.files.some(

            f => f.path === file

        );

    }

}

export default new CodeDiscoveryEngine();
