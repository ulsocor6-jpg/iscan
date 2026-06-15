#!/bin/bash
# Run from project root: bash fix_register_email.sh
set -e

TS=$(date +%Y%m%d_%H%M%S)
BACKUP="./_backup_$TS"
mkdir -p "$BACKUP/src/controllers"
cp -a src/controllers/authController.js "$BACKUP/src/controllers/"

python3 - << 'PYEOF'
path = "src/controllers/authController.js"
with open(path) as f:
    content = f.read()

old = """    // 4. Send verification email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const verifyLink = `${process.env.APP_URL}/api/v1/auth/verify-email?token=${verificationToken}`;

    await transporter.sendMail({
      from: `"ISCAN System" <${process.env.EMAIL_USER}>`,
      to: normalizedEmail,
      subject: 'Verify your ISCAN account',
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Welcome to ISCAN</h2>
          <p>Verify your account to activate your wallet.</p>
          <a href="${verifyLink}">Verify Account</a>
        </div>
      `
    });"""

new = """    // 4. Send verification email (non-blocking - registration must not fail/hang if email fails)
    const verifyLink = `${process.env.APP_URL}/api/v1/auth/verify-email?token=${verificationToken}`;

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000
      });

      await transporter.sendMail({
        from: `"ISCAN System" <${process.env.EMAIL_USER}>`,
        to: normalizedEmail,
        subject: 'Verify your ISCAN account',
        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>Welcome to ISCAN</h2>
            <p>Verify your account to activate your wallet.</p>
            <a href="${verifyLink}">Verify Account</a>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('[REGISTER] Verification email failed to send (continuing):', emailErr.message);
    }"""

if old not in content:
    raise SystemExit("Pattern not found in authController.js - aborting to avoid silent no-op")

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("  wrapped verification email in try/catch with 5s timeouts")
PYEOF

echo ""
echo "=== Done ==="
echo "Backups in: $BACKUP/"
echo "Restart the server (npm start 2>&1 | tee server.log) and re-run debug_register.sh"
