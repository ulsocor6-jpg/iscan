// src/services/operator/incidentEngine.js

import { diagnose } from "./diagnosisEngine.js";
import incidentRegistry from "./incidentRegistry.js";

class IncidentEngine {

    process(event) {

        const diagnosis = diagnose(event);

        if (!diagnosis) return null;

        const result = incidentRegistry.open({

            code: diagnosis.code,

            title: diagnosis.title,

            severity: diagnosis.severity,

            recommendation: diagnosis.recommendation,

            source: event.stage,

            orderId:
                event.metadata?.orderId,

            currency:
                event.metadata?.currency,

            resource:
                event.metadata?.resource,

            metadata: event.metadata || {}

        });

        return {

            ...result.incident,

            created: result.created

        };

    }

    resolve(code, source) {

        return incidentRegistry.resolve(
            code,
            source
        );

    }

    acknowledge(id) {

        return incidentRegistry.acknowledge(id);

    }

    list() {

        return incidentRegistry.list();

    }

    listOpen() {

        return incidentRegistry.listOpen();

    }

    get(id) {

        return incidentRegistry.get(id);

    }

}

export default new IncidentEngine();
