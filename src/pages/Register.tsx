import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../services/authService";
import "../styles/auth.css";

export default function Register() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!firstName || !lastName || !email || !password) { setError("Please fill in all fields."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      await register({ firstName, lastName, email, password });
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-mark">IS</span>
          <span className="auth-logo-text">ISCAN</span>
        </div>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-sub">Start sending money across borders</p>
        {error && <div className="auth-alert auth-alert--error">{error}</div>}
        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <div className="auth-row">
            <div className="auth-field">
              <label htmlFor="firstName">First name</label>
              <input id="firstName" type="text" placeholder="Juan" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div className="auth-field">
              <label htmlFor="lastName">Last name</label>
              <input id="lastName" type="text" placeholder="dela Cruz" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" placeholder="Min. 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="auth-footer">Already have an account? <Link to="/login" className="auth-link">Sign in</Link></p>
      </div>
    </div>
  );
}
