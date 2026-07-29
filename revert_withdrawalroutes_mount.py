#!/usr/bin/env python3
"""
Un-mounts withdrawalRoutes.js (the broken auto-completing PHP path) from
app.js. The real, working PHP withdrawal flow is paymentRoutes.js's
/cashout — already mounted at /api/v1/payment. This script removes the
import and app.use() line added by the earlier apply_appjs_patch.py, and
leaves a comment explaining why, so future-you doesn't wonder why the
file exists but isn't wired up.

Run from your project root: python3 revert_withdrawalroutes_mount.py
"""
import shutil
import sys
import time

TARGET = "app.js"

with open(TARGET, "r", encoding="utf-8") as f:
    content = f.read()

original = content

import_line = 'import withdrawalRoutes from "./src/routes/withdrawalRoutes.js";\n'
mount_line = 'app.use("/api/v1/withdraw", withdrawalRoutes);\n'

replacement_comment = (
    "// withdrawalRoutes.js is intentionally NOT mounted. It self-completes\n"
    "// PHP withdrawals without any human disbursement step, which does not\n"
    "// match how this system actually operates (operator must manually\n"
    "// disburse and confirm via the Cashouts dashboard). The real PHP\n"
    "// withdrawal flow is paymentRoutes.js's /cashout (mounted below at\n"
    "// /api/v1/payment), which creates a pending_review WithdrawalRequest\n"
    "// and alerts the operator via Telegram. Re-mount withdrawalRoutes.js\n"
    "// only once a real, confirmed disbursement API exists and this\n"
    "// project deliberately moves to automated sends.\n"
)

if import_line not in content:
    print("SKIP: withdrawalRoutes import not found (already removed?).")
else:
    content = content.replace(import_line, "", 1)

if mount_line not in content:
    print("SKIP: withdrawalRoutes mount not found (already removed?).")
else:
    content = content.replace(mount_line, replacement_comment, 1)

if content == original:
    print("Nothing changed.")
    sys.exit(0)

backup_name = f"app.js.bak.{int(time.time())}"
shutil.copyfile(TARGET, backup_name)
print(f"Backup saved as {backup_name}")

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Reverted {TARGET} successfully — withdrawalRoutes.js is now unmounted.")
