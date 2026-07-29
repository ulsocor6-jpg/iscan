#!/usr/bin/env python3
"""
Patches app.js in place:
  1. imports withdrawalRoutes + apiNotFoundHandler/globalErrorHandler
  2. mounts withdrawalRoutes at /api/v1/withdraw
  3. inserts apiNotFoundHandler before the assets-404 handler
  4. inserts globalErrorHandler as the very last app.use()

Makes a timestamped backup of app.js before touching it.
Run from your project root: python3 apply_appjs_patch.py
"""
import re
import shutil
import sys
import time

TARGET = "app.js"

with open(TARGET, "r", encoding="utf-8") as f:
    content = f.read()

original = content

# ---- 1a. Add the withdrawalRoutes import ----
anchor_import = 'import adminWithdrawalRoutes from "./src/routes/adminWithdrawalRoutes.js";'
new_import = anchor_import + '\nimport withdrawalRoutes from "./src/routes/withdrawalRoutes.js";'
if anchor_import not in content:
    sys.exit("ABORT: could not find adminWithdrawalRoutes import line — app.js may have changed since last upload. No changes made.")
if "withdrawalRoutes.js\";\n" in content and 'import withdrawalRoutes from "./src/routes/withdrawalRoutes.js";' in content:
    print("SKIP: withdrawalRoutes import already present.")
else:
    content = content.replace(anchor_import, new_import, 1)

# ---- 1b. Add the error handler import ----
anchor_limiter = 'import { generalApiLimiter } from "./middleware/rateLimiters.js";'
new_limiter = anchor_limiter + '\nimport { apiNotFoundHandler, globalErrorHandler } from "./middleware/apiErrorHandlers.js";'
if anchor_limiter not in content:
    sys.exit("ABORT: could not find generalApiLimiter import line. No changes made.")
if 'import { apiNotFoundHandler, globalErrorHandler } from "./middleware/apiErrorHandlers.js";' in content:
    print("SKIP: apiErrorHandlers import already present.")
else:
    content = content.replace(anchor_limiter, new_limiter, 1)

# ---- 2. Mount withdrawalRoutes ----
anchor_mount = 'app.use("/api/v1/crypto-withdrawals", cryptoWithdrawalRoutes);'
new_mount = anchor_mount + '\napp.use("/api/v1/withdraw", withdrawalRoutes);'
if anchor_mount not in content:
    sys.exit("ABORT: could not find crypto-withdrawals mount line. No changes made.")
if 'app.use("/api/v1/withdraw", withdrawalRoutes);' in content:
    print("SKIP: withdrawalRoutes mount already present.")
else:
    content = content.replace(anchor_mount, new_mount, 1)

# ---- 3. Insert apiNotFoundHandler before the assets-404 handler ----
anchor_assets = 'app.get(/^\\/assets\\/.*/, (req, res) => {'
if anchor_assets not in content:
    sys.exit("ABORT: could not find assets 404 handler. No changes made.")
if "app.use(apiNotFoundHandler);" in content:
    print("SKIP: apiNotFoundHandler already inserted.")
else:
    content = content.replace(
        anchor_assets,
        "app.use(apiNotFoundHandler);\n\n" + anchor_assets,
        1,
    )

# ---- 4. Insert globalErrorHandler right before `export default app;` ----
anchor_export = "export default app;"
if anchor_export not in content:
    sys.exit("ABORT: could not find `export default app;`. No changes made.")
if "app.use(globalErrorHandler);" in content:
    print("SKIP: globalErrorHandler already inserted.")
else:
    content = content.replace(
        anchor_export,
        "app.use(globalErrorHandler);\n\n" + anchor_export,
        1,
    )

if content == original:
    print("Nothing changed — all patches were already present.")
    sys.exit(0)

backup_name = f"app.js.bak.{int(time.time())}"
shutil.copyfile(TARGET, backup_name)
print(f"Backup saved as {backup_name}")

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Patched {TARGET} successfully.")
