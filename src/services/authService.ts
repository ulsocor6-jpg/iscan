const API_BASE = "/api/v1";

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("API error:", res.status, data); throw new Error(data.message || "Request failed"); }
  return data;
}

// Step 1: password check. On success this returns
// { success, requiresOtp: true, ticket, message } — no session yet.
export const login = (email: string, password: string) =>
  api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

// Step 2: OTP confirms the login, revokes any other active session for
// this account instantly, and returns the real user/session.
export const verifyLoginOtp = (ticket: string, code: string) =>
  api("/auth/login/verify-otp", { method: "POST", body: JSON.stringify({ ticket, code }) });

export const resendLoginOtp = (ticket: string) =>
  api("/auth/login/resend-otp", { method: "POST", body: JSON.stringify({ ticket }) });

export const register = (payload: { email: string; password: string; firstName: string; lastName: string }) =>
  api("/auth/register", { method: "POST", body: JSON.stringify(payload) });

export const logout = () => api("/auth/logout", { method: "POST" });
export const getMe  = () => api("/auth/me");

export const forgotPassword = (email: string) =>
  api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });

export const resetPassword = (token: string, password: string) =>
  api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
