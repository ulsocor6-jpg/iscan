import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../services/authService";
import "../styles/auth.css";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setShowResend(false);
    setResendMsg("");
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err: any) {
      const msg = err.message || "Login failed.";
      setError(msg);
      if (msg.toLowerCase().includes("verify")) setShowResend(true);
    } finally {
      setLoading(false);
    }
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
        {resendMsg && <div className="auth-alert auth-alert--success">{resendMsg}</div>}
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
