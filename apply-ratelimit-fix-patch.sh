#!/usr/bin/env bash
# ISCAN — fix OTP rate-limit lockout + admin exemption + resend message styling bug
set -e

if [ ! -f "middleware/rateLimiters.js" ]; then
  echo "ERROR: run this from the iscansystem repo root."
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=".patch-backup-ratelimit-$STAMP"
mkdir -p "$BACKUP_DIR"

echo "==> Backing up files to $BACKUP_DIR"
cp middleware/rateLimiters.js "$BACKUP_DIR/rateLimiters.js.bak"
cp src/routes/authRoutes.js "$BACKUP_DIR/authRoutes.js.bak"
cp src/pages/Login.tsx "$BACKUP_DIR/Login.tsx.bak"

echo "==> Patching middleware/rateLimiters.js (new OTP limiters + admin exemption)"
python3 << 'PYEOF'
path = "middleware/rateLimiters.js"
with open(path) as f:
    content = f.read()

old_header = 'import rateLimit from "express-rate-limit";'

new_header = '''import rateLimit from "express-rate-limit";
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
}'''

if old_header not in content:
    raise SystemExit("PATCH FAILED: rateLimiters.js — header line not found. No changes written.")

content = content.replace(old_header, new_header, 1)

addition = '''

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
});'''

content = content.rstrip("\n") + addition + "\n"

with open(path, "w") as f:
    f.write(content)

print("rateLimiters.js patched OK")
PYEOF

echo "==> Patching src/routes/authRoutes.js (use new limiters + admin-exempt middleware)"
python3 << 'PYEOF'
path = "src/routes/authRoutes.js"
with open(path) as f:
    content = f.read()

old_import = "import { loginLimiter, authActionLimiter } from '../../middleware/rateLimiters.js';"
new_import = "import { loginLimiter, authActionLimiter, loginOtpVerifyLimiter, loginOtpResendLimiter, markLoginOtpAdmin } from '../../middleware/rateLimiters.js';"

if old_import not in content:
    raise SystemExit("PATCH FAILED: authRoutes.js — rateLimiters import line not found. No changes written.")

content = content.replace(old_import, new_import, 1)

old_routes = """router.post('/login', loginLimiter, login);
router.post('/login/verify-otp', authActionLimiter, verifyLoginOtp);
router.post('/login/resend-otp', authActionLimiter, resendLoginOtp);"""

new_routes = """router.post('/login', loginLimiter, login);
router.post('/login/verify-otp', markLoginOtpAdmin, loginOtpVerifyLimiter, verifyLoginOtp);
router.post('/login/resend-otp', markLoginOtpAdmin, loginOtpResendLimiter, resendLoginOtp);"""

if old_routes not in content:
    raise SystemExit("PATCH FAILED: authRoutes.js — login routes block not found. No changes written.")

content = content.replace(old_routes, new_routes, 1)

with open(path, "w") as f:
    f.write(content)

print("authRoutes.js patched OK")
PYEOF

echo "==> Patching src/pages/Login.tsx (fix green/red message styling bug)"
python3 << 'PYEOF'
path = "src/pages/Login.tsx"
with open(path) as f:
    content = f.read()

old_helper = '''function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - 2, 3))}@${domain}`;
}'''

new_helper = '''function maskEmail(email: string) {
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
}'''

if old_helper not in content:
    raise SystemExit("PATCH FAILED: Login.tsx — maskEmail helper not found. No changes written.")

content = content.replace(old_helper, new_helper, 1)

old_resend_alert = '''        {resendMsg && <div className="auth-alert auth-alert--success">{resendMsg}</div>}'''
new_resend_alert = '''        {resendMsg && (
          <div className={`auth-alert ${isErrorish(resendMsg) ? "auth-alert--error" : "auth-alert--success"}`}>
            {resendMsg}
          </div>
        )}'''

if old_resend_alert not in content:
    raise SystemExit("PATCH FAILED: Login.tsx — resendMsg alert block not found. No changes written.")

content = content.replace(old_resend_alert, new_resend_alert, 1)

old_otp_alert = '''          {otpResendMsg && (
            <div className={`auth-alert ${otpResendMsg.toLowerCase().includes("wait") ? "auth-alert--error" : "auth-alert--success"}`}>
              {otpResendMsg}
            </div>
          )}'''
new_otp_alert = '''          {otpResendMsg && (
            <div className={`auth-alert ${isErrorish(otpResendMsg) ? "auth-alert--error" : "auth-alert--success"}`}>
              {otpResendMsg}
            </div>
          )}'''

if old_otp_alert not in content:
    raise SystemExit("PATCH FAILED: Login.tsx — otpResendMsg alert block not found. No changes written.")

content = content.replace(old_otp_alert, new_otp_alert, 1)

with open(path, "w") as f:
    f.write(content)

print("Login.tsx patched OK")
PYEOF

echo ""
echo "==> Done. Backups saved in $BACKUP_DIR"
echo "Restart the backend (node server.js) to pick up the rate-limiter changes."
echo "Vite should hot-reload Login.tsx automatically."
