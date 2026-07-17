import rateLimit from "express-rate-limit";

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
 */
const WEBHOOK_PATH_PREFIXES = [
  "/api/v1/maya",
  "/api/v1/maribank",
  "/api/v1/webhooks",
  "/api/v1/didit/webhook",
];
const AUTH_PATH_PREFIXES = ["/api/v1/auth"];
const SKIP_GENERAL_LIMIT_PREFIXES = [...WEBHOOK_PATH_PREFIXES, ...AUTH_PATH_PREFIXES];
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
