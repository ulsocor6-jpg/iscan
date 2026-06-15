#!/bin/bash
# Run from project root: bash add_register_debug_logs.sh
set -e

TS=$(date +%Y%m%d_%H%M%S)
BACKUP="./_backup_$TS"
mkdir -p "$BACKUP/src/controllers"
cp -a src/controllers/authController.js "$BACKUP/src/controllers/"

python3 - << 'PYEOF'
path = "src/controllers/authController.js"
with open(path) as f:
    content = f.read()

replacements = [
    (
        "    const existing = await User.findOne({ email: normalizedEmail });",
        "    console.log('[REGISTER] step: checking existing user...');\n    const existing = await User.findOne({ email: normalizedEmail });\n    console.log('[REGISTER] step: existing check done');"
    ),
    (
        "    const hashedPassword = await bcrypt.hash(password, 10);",
        "    console.log('[REGISTER] step: hashing password...');\n    const hashedPassword = await bcrypt.hash(password, 10);\n    console.log('[REGISTER] step: password hashed');"
    ),
    (
        "    const user = await User.create({",
        "    console.log('[REGISTER] step: creating user...');\n    const user = await User.create({"
    ),
    (
        "    // 2. CREATE OR GET WALLET (SOURCE OF TRUTH)\n    const wallet = await WalletService.getOrCreateWallet(user._id);",
        "    console.log('[REGISTER] step: user created, id=', user._id);\n\n    // 2. CREATE OR GET WALLET (SOURCE OF TRUTH)\n    console.log('[REGISTER] step: creating wallet...');\n    const wallet = await WalletService.getOrCreateWallet(user._id);\n    console.log('[REGISTER] step: wallet created, id=', wallet._id);"
    ),
    (
        "    // 3. Link wallet to user\n    await User.findByIdAndUpdate(user._id, {\n      walletId: wallet._id\n    });",
        "    // 3. Link wallet to user\n    console.log('[REGISTER] step: linking wallet to user...');\n    await User.findByIdAndUpdate(user._id, {\n      walletId: wallet._id\n    });\n    console.log('[REGISTER] step: wallet linked');"
    ),
    (
        "    // 4. Send verification email (non-blocking - registration must not fail/hang if email fails)",
        "    console.log('[REGISTER] step: about to send email...');\n    // 4. Send verification email (non-blocking - registration must not fail/hang if email fails)"
    ),
    (
        "    } catch (emailErr) {\n      console.error('[REGISTER] Verification email failed to send (continuing):', emailErr.message);\n    }",
        "    } catch (emailErr) {\n      console.error('[REGISTER] Verification email failed to send (continuing):', emailErr.message);\n    }\n    console.log('[REGISTER] step: email step done, sending response...');"
    ),
]

for old, new in replacements:
    if old not in content:
        raise SystemExit(f"Pattern not found, aborting:\n{old[:80]}")
    content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("  added step-by-step debug logs to register()")
PYEOF

echo ""
echo "=== Done ==="
echo "Backups in: $BACKUP/"
echo "Restart: npm start 2>&1 | tee server.log"
echo "Then in another tab: bash debug_register.sh"
echo "Then: tail -50 server.log   <-- this will show exactly which step hangs"
