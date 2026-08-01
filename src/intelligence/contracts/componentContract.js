/*
|--------------------------------------------------------------------------
| ISCAN Operational Component Contract
|--------------------------------------------------------------------------
|
| Every executable component may export:
|
| export const contract = { ... }
|
| The Contract Loader automatically discovers them.
|
*/

export const ContractVersion = "1.0";

export const HealthStates = [

    "HEALTHY",

    "DEGRADED",

    "BLOCKED",

    "FAILED"

];

export const ContractTemplate = {

    id: "",

    component: "",

    purpose: "",

    owner: "",

    receives: [],

    emits: [],

    dependsOn: [],

    downstream: [],

    timeoutMs: 0,

    retries: 0,

    recovery: "",

    observability: [],

    failureConditions: [],

    healthIndicators: []

};
