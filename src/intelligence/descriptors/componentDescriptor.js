/*
|--------------------------------------------------------------------------
| ISCAN Component Descriptor Standard
|--------------------------------------------------------------------------
|
| Every executable module should export:
|
| export const descriptor = { ... }
|
| or
|
| MyClass.descriptor = { ... }
|
| The Architecture Loader automatically discovers them.
|
*/

export const DescriptorVersion = "1.0";

export const ComponentTypes = [

    "controller",
    "service",
    "worker",
    "watcher",
    "executor",
    "consumer",
    "producer",
    "scheduler",
    "bridge",
    "pipeline",
    "engine",
    "repository",
    "adapter",
    "gateway",
    "validator",
    "parser",
    "listener",
    "observer"

];

export function createDescriptor(d = {}) {

    return {

        version: DescriptorVersion,

        id: d.id,

        name: d.name,

        type: d.type,

        domain: d.domain,

        owner: d.owner || "ISCAN",

        description: d.description || "",

        purpose: d.purpose || [],

        inputs: d.inputs || [],

        outputs: d.outputs || [],

        eventsConsumed: d.eventsConsumed || [],

        eventsProduced: d.eventsProduced || [],

        dependsOn: d.dependsOn || [],

        provides: d.provides || [],

        consumes: d.consumes || [],

        startup: d.startup || "",

        shutdown: d.shutdown || "",

        healthChecks: d.healthChecks || [],

        failureModes: d.failureModes || [],

        recovery: d.recovery || {},

        metrics: d.metrics || [],

        tags: d.tags || [],

        criticality: d.criticality || "MEDIUM"

    };

}
