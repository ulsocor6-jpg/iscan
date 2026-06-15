import { useState, FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { forgotPassword, resetPassword } from "../services/authService";
import "../styles/auth.css";

export default function ForgotPassword({ resetMode = false }: { resetMode?: boolean }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [message, setMessage]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    setError(""); setMessage("");
    if (!email) { setError("Please enter your email."); return; }
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch {}
    setMessage("If that email is registered, a reset link has been sent.");
    setDone(true);
    setLoading(false);
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError(""); setMessage("");
    if (!password) { setError("Please enter a new password."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (!token) { setError("Reset token is missing."); return; }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setMessage("Password updated. You can now sign in.");
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Reset failed. Link may have expired.");
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-mark">IS</span>
          <span className="auth-logo-text">ISCAN</span>
        </div>
        {!resetMode ? (
          <>
            <h1 className="auth-title">Reset password</h1>
            <p className="auth-sub">Enter your email and we'll send a reset link.</p>
            {error && <div className="auth-alert auth-alert--error">{error}</div>}
            {message && <div className="auth-alert auth-alert--success">{message}</div>}
            {!done && (
              <form onSubmit={handleForgot} className="auth-form" noValidate>
                <div className="auth-field">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </div>
                <button type="submit" className="auth-btn" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</button>
              </form>
            )}
          </>
        ) : (
          <>
            <h1 className="auth-title">Set new password</h1>
            <p className="auth-sub">Choose a strong password for your account.</p>
            {error && <div className="auth-alert auth-alert--error">{error}</div>}
            {message && <div className="auth-alert auth-alert--success">{message}</div>}
            {!done && (
              <form onSubmit={handleReset} className="auth-form" noValidate>
                <div className="auth-field">
                  <label htmlFor="password">New password</label>
                  <input id="password" type="password" placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
                </div>
                <div className="auth-field">
                  <label htmlFor="confirm">Confirm password</label>
                  <input id="confirm" type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                <button type="submit" className="auth-btn" disabled={loading}>{loading ? "Updating…" : "Set new password"}</button>
              </form>
            )}
          </>
        )}
        <p className="auth-footer"><Link to="/login" className="auth-link">← Back to sign in</Link></p>
      </div>
    </div>
  );
}
