import contractLoader from "./contractLoader.js";
import architectureKnowledgeGraph from "../architecture/architectureKnowledgeGraph.js";

class ContractValidator {

    validate(contract = {}) {

        const errors = [];

        if (!contract.id)
            errors.push("Missing id");

        if (!contract.component)
            errors.push("Missing component");

        if (!contract.purpose)
            errors.push("Missing purpose");

        if (!Array.isArray(contract.receives))
            errors.push("receives must be an array");

        if (!Array.isArray(contract.emits))
            errors.push("emits must be an array");

        if (!Array.isArray(contract.dependsOn))
            errors.push("dependsOn must be an array");

        if (!Array.isArray(contract.downstream))
            errors.push("downstream must be an array");

        if (
            contract.timeoutMs != null &&
            contract.timeoutMs < 0
        )
            errors.push("timeoutMs must be >= 0");

        if (
            contract.retries != null &&
            contract.retries < 0
        )
            errors.push("retries must be >= 0");

        for (const target of contract.downstream || []) {

            if (!architectureKnowledgeGraph.has(target)) {

                errors.push(
                    `Unknown downstream component: ${target}`
                );

            }

        }

        return {

            valid: errors.length === 0,

            errors

        };

    }

    validateAll() {

        return contractLoader
            .list()
            .map(contract => ({

                id: contract.id,

                ...this.validate(contract)

            }));

    }

}

export default new ContractValidator();
