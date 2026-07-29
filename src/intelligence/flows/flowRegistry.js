import autoCreditFlow from "./autoCreditFlow.js";

class FlowRegistry {

    constructor() {

        this.flows = new Map();

        this.register(autoCreditFlow);

    }

    register(flow) {

        this.flows.set(flow.id, flow);

    }

    get(id) {

        return this.flows.get(id);

    }

    list() {

        return [...this.flows.values()];

    }

    findStage(flowId, stageId) {

        const flow = this.get(flowId);

        if (!flow) return null;

        return flow.stages.find(s => s.id === stageId);

    }

    next(flowId, stageId) {

        const stage = this.findStage(flowId, stageId);

        if (!stage?.next) return null;

        return this.findStage(flowId, stage.next);

    }

}

export default new FlowRegistry();
