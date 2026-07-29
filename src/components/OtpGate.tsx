import { useState, useEffect, useCallback } from "react";

interface OtpGateProps {
  open: boolean;
  purpose: string;
  actionParams: Record<string, any>;
  onVerified: (otpToken: string) => void;
  onClose: () => void;
}

const RESEND_COOLDOWN_SECONDS = 30;

// Centered popup that sends a WITHDRAWAL (or other purpose) OTP the moment
// it opens, collects the 6-digit code, and hands the caller back the
// single-use otpToken from POST /api/v1/verification/otp/verify.
// The caller is responsible for retrying its original request with that
// token attached — this component only owns the send/verify UI.
export default function OtpGate({ open, purpose, actionParams, onVerified, onClose }: OtpGateProps) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const sendCode = useCallback(async () => {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/v1/verification/otp/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }, [purpose]);

  // Fire the send exactly once each time the gate opens.
  useEffect(() => {
    if (!open) {
      setCode("");
      setError("");
      setCooldown(0);
      return;
    }
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify() {
    if (code.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      const res = await fetch("/api/v1/verification/otp/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, purpose, actionParams }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      onVerified(data.otpToken);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#0d1526",
          border: "1px solid #1d2942",
          borderRadius: 14,
          padding: 24,
          width: 340,
          maxWidth: "90vw",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "white" }}>🔐 Verify it's you</h3>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
        <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 16px" }}>
          {sending ? "Sending code to your email…" : "Enter the 6-digit code we emailed you."}
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          autoFocus
          inputMode="numeric"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 8,
            border: "1px solid #1d2942",
            background: "#121b2f",
            color: "white",
            fontSize: 22,
            letterSpacing: 8,
            textAlign: "center",
            boxSizing: "border-box",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") verify();
          }}
        />
        {error && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{error}</p>}
        <button
          className="auth-btn"
          onClick={verify}
          disabled={verifying || code.length !== 6}
          style={{ marginTop: 16, width: "100%" }}
        >
          {verifying ? "Verifying…" : "Verify"}
        </button>
        <button
          onClick={sendCode}
          disabled={cooldown > 0 || sending}
          style={{
            marginTop: 10,
            width: "100%",
            background: "transparent",
            border: "1px solid #1d2942",
            borderRadius: 8,
            color: cooldown > 0 ? "#475569" : "#94a3b8",
            padding: "8px 0",
            cursor: cooldown > 0 ? "not-allowed" : "pointer",
            fontSize: 12,
          }}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
