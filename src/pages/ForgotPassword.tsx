import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import "../styles/auth.css";

export default function ForgotPassword() {
  const [email, setEmail]     = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setMessage(data.message);
      setSent(true);
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setMessage(data.message);
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{textAlign:"center"}}>
          <div className="auth-logo">
            <span className="auth-logo-mark">IS</span>
            <span className="auth-logo-text">ISCAN</span>
          </div>
          <div style={{fontSize:"48px",margin:"16px 0"}}>📧</div>
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-sub" style={{marginBottom:"16px"}}>
            We sent a password reset link to <strong>{email}</strong>
          </p>
          <div style={{background:"rgba(255,193,7,0.1)",border:"1px solid rgba(255,193,7,0.3)",borderRadius:"8px",padding:"12px 16px",marginBottom:"24px",textAlign:"left"}}>
            <p style={{margin:0,fontSize:"13px",color:"#fbbf24",lineHeight:"1.6"}}>
              💡 <strong>Didn't receive it?</strong> Check your <strong>spam or junk folder</strong>. The reset link expires in <strong>1 hour</strong>.
            </p>
          </div>
          {message && <div className="auth-alert auth-alert--success" style={{marginBottom:"16px"}}>{message}</div>}
          <button onClick={handleResend} disabled={loading} className="auth-btn" style={{marginBottom:"12px",background:"transparent",border:"1px solid #4F46E5",color:"#4F46E5"}}>
            {loading ? "Sending…" : "Resend reset email"}
          </button>
          <Link to="/login" className="auth-btn" style={{display:"block",textDecoration:"none"}}>
            Back to Sign In
          </Link>
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
        <h1 className="auth-title">Reset password</h1>
        <p className="auth-sub">Enter your email and we'll send you a reset link</p>
        {message && <div className="auth-alert auth-alert--success">{message}</div>}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="auth-footer"><Link to="/login" className="auth-link">← Back to Sign In</Link></p>
      </div>
    </div>
  );
}
