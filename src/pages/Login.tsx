import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, verifyLoginOtp, resendLoginOtp } from "../services/authService";
import "../styles/auth.css";

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - 2, 3))}@${domain}`;
}

// Rate-limit / lockout / failure messages should never render as a
// success banner, regardless of which action produced them.
function isErrorish(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("too many") ||
    m.includes("wait") ||
    m.includes("expired") ||
    m.includes("invalid") ||
    m.includes("failed") ||
    m.includes("locked")
  );
}

export default function Login() {
  const navigate = useNavigate();

  // step: "credentials" -> "otp"
  const [step, setStep] = useState<"credentials" | "otp">("credentials");

  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resending, setResending] = useState(false);

  // OTP step state
  const [ticket, setTicket]       = useState("");
  const [code, setCode]           = useState("");
  const [otpError, setOtpError]   = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpResendMsg, setOtpResendMsg] = useState("");
  const [otpResending, setOtpResending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setShowResend(false);
    setResendMsg("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data.requiresOtp && data.ticket) {
        setTicket(data.ticket);
        setOtpError("");
        setOtpResendMsg("");
        setCode("");
        setStep("otp");
      } else {
        // Fallback in case a build without OTP responds directly.
        navigate("/dashboard");
      }
    } catch (err: any) {
      const msg = err.message || "Login failed.";
      setError(msg);
      if (msg.toLowerCase().includes("verify")) setShowResend(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setOtpError("");
    if (!code || code.length < 6) { setOtpError("Enter the 6-digit code."); return; }
    setOtpLoading(true);
    try {
      await verifyLoginOtp(ticket, code);
      navigate("/dashboard");
    } catch (err: any) {
      setOtpError(err.message || "Invalid code.");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleOtpResend() {
    setOtpResending(true);
    setOtpResendMsg("");
    try {
      const data = await resendLoginOtp(ticket);
      setOtpResendMsg(data.message || "Code resent.");
    } catch (err: any) {
      setOtpResendMsg(err.message || "Failed to resend. Please try again.");
    } finally {
      setOtpResending(false);
    }
  }

  function handleBackToCredentials() {
    setStep("credentials");
    setTicket("");
    setCode("");
    setOtpError("");
    setOtpResendMsg("");
  }

  async function handleResend() {
    setResending(true);
    setResendMsg("");
    try {
      const res = await fetch("/api/v1/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setResendMsg(data.message || "Verification email sent.");
    } catch {
      setResendMsg("Failed to resend. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (step === "otp") {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-logo">
            <span className="auth-logo-mark">IS</span>
            <span className="auth-logo-text">ISCAN</span>
          </div>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub">
            We sent a code to <strong>{maskEmail(email)}</strong>
          </p>

          {otpError && <div className="auth-alert auth-alert--error">{otpError}</div>}
          {otpResendMsg && (
            <div className={`auth-alert ${isErrorish(otpResendMsg) ? "auth-alert--error" : "auth-alert--success"}`}>
              {otpResendMsg}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="otp-code">Verification code</label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
                style={{ letterSpacing: "4px", textAlign: "center", fontSize: "20px" }}
              />
            </div>

            <button type="submit" className="auth-btn" disabled={otpLoading}>
              {otpLoading ? "Verifying…" : "Verify & Sign in"}
            </button>
          </form>

          <div className="auth-meta" style={{ justifyContent: "space-between", marginTop: "14px" }}>
            <button
              type="button"
              onClick={handleOtpResend}
              disabled={otpResending}
              className="auth-link"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {otpResending ? "Sending…" : "Resend code"}
            </button>
            <button
              type="button"
              onClick={handleBackToCredentials}
              className="auth-link"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Use a different account
            </button>
          </div>

          <p className="auth-footer" style={{ marginTop: "18px" }}>
            Signing in here will sign you out anywhere else you're currently logged in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-mark">IS</span>
          <span className="auth-logo-text">ISCAN</span>
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in to your account</p>
        {error && (
          <div className="auth-alert auth-alert--error">
            {error}
            {showResend && (
              <div style={{marginTop:"10px"}}>
                <button onClick={handleResend} disabled={resending}
                  style={{background:"transparent",border:"1px solid #f87171",color:"#f87171",padding:"6px 14px",borderRadius:"6px",cursor:"pointer",fontSize:"13px"}}>
                  {resending ? "Sending…" : "Resend verification email"}
                </button>
              </div>
            )}
          </div>
        )}
        {resendMsg && (
          <div className={`auth-alert ${isErrorish(resendMsg) ? "auth-alert--error" : "auth-alert--success"}`}>
            {resendMsg}
          </div>
        )}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="auth-meta">
            <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-footer">No account? <Link to="/register" className="auth-link">Create one</Link></p>
      </div>
    </div>
  );
}
