import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

class ContractLoader {

    constructor() {

        this.contracts = new Map();

    }

    async load(root = "src") {

        let loaded = 0;

        await this.walk(root, async file => {

            if (!file.endsWith(".js"))
                return;

            try {

                const mod = await import(
                    pathToFileURL(
                        path.resolve(file)
                    ).href
                );

                const contract =

                    mod.contract ||

                    mod.default?.contract ||

                    mod.default?.constructor?.contract ||

                    Object.values(mod).find(
                        value => value?.contract
                    )?.contract;

                if (!contract?.id)
                    return;

                this.contracts.set(
                    contract.id,
                    contract
                );

                loaded++;

            } catch {

                // Ignore runtime-only modules

            }

        });

        console.log(
            `[ContractLoader] Loaded ${loaded} operational contract(s).`
        );

    }

    get(id) {

        return this.contracts.get(id);

    }

    list() {

        return [...this.contracts.values()];

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

export default new ContractLoader();
