import brainBus from "./brainBus.js";
import { Channels } from "./channels.js";

class InspectorBridge {
    onFlowStarted(flow) {
        brainBus.emit(Channels.INSPECTOR_FLOW_STARTED, flow, {
            source: "InspectorService",
            correlationId: flow.flowId
        });
    }

    onFlowStage(flowId, stageName, data = {}) {
        brainBus.emit(Channels.INSPECTOR_FLOW_STAGE, {
            flowId,
            stage: stageName,
            data,
            timestamp: new Date().toISOString()
        }, {
            source: "InspectorService",
            correlationId: flowId
        });
    }

    onFlowCompleted(flowId, result = {}) {
        brainBus.emit(Channels.INSPECTOR_FLOW_COMPLETED, {
            flowId,
            result,
            timestamp: new Date().toISOString()
        }, {
            source: "InspectorService",
            correlationId: flowId
        });
    }

    onFlowDeviation(flowId, reasoningResult) {
        brainBus.emit(Channels.INSPECTOR_FLOW_DEVIATION, {
            flowId,
            reasoning: reasoningResult,
            timestamp: new Date().toISOString()
        }, {
            source: "ReasoningEngine",
            correlationId: flowId
        });

        if (reasoningResult.verdict !== "ON_TRACK" &&
            reasoningResult.verdict !== "TERMINATED" &&
            reasoningResult.verdict !== "UNKNOWN_PIPELINE") {
            brainBus.emit(Channels.OPERATOR_INCIDENT, {
                flowId,
                type: "FLOW_DEVIATION",
                severity: "WARN",
                diagnosis: reasoningResult.message,
                recommendation: "Review flow in Inspector dashboard."
            }, {
                source: "ReasoningEngine",
                correlationId: flowId
            });
        }
    }
}

const inspectorBridge = new InspectorBridge();
export default inspectorBridge;
