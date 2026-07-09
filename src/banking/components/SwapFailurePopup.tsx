import { useFlowerOrderWatcher } from "../hooks/useFlowerOrderWatcher";

const STAGE_LABEL: Record<string, string> = {
  FAILED_SWEEP: "moving your deposit to treasury",
  FAILED_SWAP: "swapping your FLOWER",
  FAILED_SETTLE: "finishing your payout",
  FAILED: "processing your swap",
};

export default function SwapFailurePopup() {
  const { order, failed, retrying, retry, dismiss } = useFlowerOrderWatcher();
  if (!failed) return null;

  const stageLabel = STAGE_LABEL[order.status] || "processing your swap";

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        width: "320px",
        zIndex: 1000,
        background: "#1f1330",
        border: "1px solid #ef4444",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: "4px", fontSize: "14px" }}>
        Your swap needs attention
      </div>
      <div style={{ fontSize: "13px", color: "#d1d5db", marginBottom: "12px", lineHeight: 1.5 }}>
        We ran into a problem {stageLabel}. Your funds are safe — nothing was lost, this step just
        needs to be retried.
      </div>
      {order.failureReason && (
        <div
          style={{
            fontSize: "11px",
            color: "#9ca3af",
            marginBottom: "12px",
            fontFamily: "monospace",
            background: "rgba(0,0,0,0.25)",
            padding: "6px 8px",
            borderRadius: "6px",
            wordBreak: "break-word",
          }}
        >
          {order.failureReason}
        </div>
      )}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={retry}
          disabled={retrying}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: "8px",
            background: "#7c3aed",
            color: "white",
            border: "none",
            cursor: retrying ? "default" : "pointer",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {retrying ? "Retrying..." : "Retry now"}
        </button>
        <button
          onClick={dismiss}
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            background: "transparent",
            color: "#9ca3af",
            border: "1px solid #374151",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
