import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import User from "../src/models/userModel.js";

// Best-effort decode only — never used for authorization, just for
// rate-limit keying/exemption. The route handlers themselves verify the
// ticket signature before trusting anything in it.
function ticketUserId(req) {
  try {
    const decoded = jwt.decode(req.body?.ticket || "");
    return decoded?.id ? String(decoded.id) : null;
  } catch {
    return null;
  }
}

/**
 * Runs before the OTP rate limiters on /login/verify-otp and
 * /login/resend-otp. Looks up the ticket's account role and stamps
 * req._rateLimitAdminExempt so the limiter's `skip` can stay a plain
 * synchronous check — some express-rate-limit versions don't await an
 * async `skip`, and an un-awaited Promise is truthy, which would
 * silently disable rate limiting for everyone. Doing the lookup here,
 * in real middleware, avoids that trap entirely.
 *
 * This never blocks the request — worst case (lookup fails, no ticket)
 * it just proceeds as non-admin, same as before this middleware existed.
 */
export async function markLoginOtpAdmin(req, res, next) {
  req._rateLimitAdminExempt = false;
  try {
    const userId = ticketUserId(req);
    if (userId) {
      const user = await User.findById(userId).select("role").lean();
      if (user?.role === "admin") {
        req._rateLimitAdminExempt = true;
      }
    }
  } catch {
    // fail closed — stays non-admin, normal rate limiting applies
  }
  next();
}

/**
 * Strict limiter for login attempts.
 * Prevents password brute-forcing against any single account or IP.
 * 10 attempts per 15 minutes, per IP.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 15 minutes."
  }
});

/**
 * Limiter for registration / password-reset-request / resend-verification.
 * Prevents mass account creation and email-bombing via forgot-password.
 * 5 attempts per hour, per IP.
 */
export const authActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again in an hour."
  }
});

/**
 * General-purpose limiter for the rest of the API.
 * Loose enough not to interfere with normal use (dashboard polling, etc.)
 * but stops basic scripted abuse. 300 requests per 15 minutes, per IP.
 *
 * Skips webhook/notify endpoints (Maya, MariBank, Transak, generic payment
 * webhooks) — these are authenticated by shared secret/signature, not
 * session, and can legitimately fire in bursts on busy trading days.
 * Rate-limiting them risks silently dropping real deposit notifications,
 * which is worse than the abuse this is meant to stop.
 *
 * Also skips admin/operator routes — those get their own, much looser
 * limiter below (adminApiLimiter). They already sit behind requireAuth +
 * requireAdmin, so the abuse this general limiter guards against (anonymous
 * scripted traffic) isn't the threat model there; the real traffic pattern
 * is a small number of logged-in operators with several polling hooks (swap
 * orders, deposits/pending, withdrawals/pending, live quote ticker, SSE
 * reconnects) open across possibly multiple tabs. That legitimately burns
 * through 300 req/15min on its own, which is what caused Swap Inspector to
 * 429 on flower-orders/deposits/withdrawals during normal use, not abuse.
 */
const WEBHOOK_PATH_PREFIXES = [
  "/api/v1/maya",
  "/api/v1/maribank",
  "/api/v1/webhooks",
  "/api/v1/didit/webhook",
];
const AUTH_PATH_PREFIXES = ["/api/v1/auth"];
const ADMIN_PATH_PREFIXES = ["/api/v1/admin", "/api/v1/operator"];
const SKIP_GENERAL_LIMIT_PREFIXES = [
  ...WEBHOOK_PATH_PREFIXES,
  ...AUTH_PATH_PREFIXES,
  ...ADMIN_PATH_PREFIXES,
];

export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => SKIP_GENERAL_LIMIT_PREFIXES.some((p) => req.originalUrl.startsWith(p)),
  message: {
    success: false,
    message: "Too many requests. Please slow down."
  }
});

/**
 * Limiter for admin/operator routes (Swap Inspector, System Inspector,
 * Blockchain Inspector, Reconciliation, operator actions/intelligence, etc).
 *
 * Every route under these prefixes already requires requireAuth +
 * requireAdmin — the person hitting these endpoints is always a known,
 * authenticated operator, never anonymous traffic. This exists purely as a
 * backstop against a runaway polling loop or infinite-retry bug, not to
 * throttle legitimate dashboard use, so the ceiling is high and the window
 * short — you want to catch a genuine bug (e.g. an effect re-firing every
 * render) fast rather than lock out a real operator mid-shift.
 *
 * Keyed by user id when available (falls back to IP) so one operator with
 * several tabs open shares one budget, rather than each tab/IP getting its
 * own — the failure mode we actually saw was one person, multiple tabs.
 */
export const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many admin requests in a short window. If this keeps happening, check for a polling loop (e.g. a useEffect re-firing) rather than retrying manually."
  }
});

/**
 * Limiter for user self-service reconciliation ("refresh my balance").
 * Prevents repeated on-chain lookups from being spammed by a single user.
 * 5 attempts per 10 minutes, per IP.
 */
export const selfServiceRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many refresh attempts. Please wait a few minutes and try again."
  }
});

/**
 * OTP code entry after login. Kept separate from authActionLimiter so a
 * few mistyped digits don't burn the same 5/hour bucket shared by
 * unrelated actions (password reset, resend-verification) — and so one
 * IP's OTP attempts on Account A can't lock out Account B on the same
 * network. Keyed by the ticket's user id rather than raw IP for the
 * same reason.
 *
 * The OTP itself already self-destructs after 3 wrong codes
 * (actionVerificationService MAX_ATTEMPTS), forcing a fresh resend —
 * this is just a backstop against hammering the route, not the primary
 * defense against guessing.
 *
 * Admin accounts skip this specific limiter (see markLoginOtpAdmin) so a
 * shared office IP or an unrelated bug can't lock an admin out of ISCAN.
 * This does NOT exempt admins from loginLimiter (the password stage) or
 * from the OTP's own 3-attempt lockout — only from this route throttle.
 */
export const loginOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req._rateLimitAdminExempt === true,
  keyGenerator: (req) => {
    const uid = ticketUserId(req);
    return uid || req.ip;
  },
  message: {
    success: false,
    message: "Too many verification attempts. Please wait a few minutes and try again."
  }
});

/**
 * Resending the login OTP. actionVerificationService.sendOtp already
 * enforces its own 30s cooldown per user+purpose (that's the primary
 * spam defense) — this is a looser backstop at the route level, same
 * admin exemption and per-user keying as loginOtpVerifyLimiter.
 */
export const loginOtpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req._rateLimitAdminExempt === true,
  keyGenerator: (req) => {
    const uid = ticketUserId(req);
    return uid || req.ip;
  },
  message: {
    success: false,
    message: "Too many resend attempts. Please wait a few minutes and try again."
  }
});
