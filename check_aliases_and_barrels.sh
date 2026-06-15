#!/bin/bash
# Run from project root: bash check_aliases_and_barrels.sh > aliases_report.txt
set -e

echo "=== tsconfig path aliases ==="
for f in tsconfig.json tsconfig.app.json jsconfig.json vite.config.js vite.config.ts; do
  if [ -f "$f" ]; then
    echo "--- $f ---"
    cat "$f"
    echo ""
  fi
done

echo ""
echo "=== index.html script entry (how main.tsx is loaded) ==="
grep -n "script\|src=" index.html public/*.html 2>/dev/null | grep -i "main\|tsx\|jsx\|module"

echo ""
echo "=== Barrel files (index.js / index.ts that re-export others) ==="
find ./src -type f \( -name 'index.js' -o -name 'index.ts' \) | while read -r f; do
  echo "--- $f ---"
  cat "$f"
  echo ""
done

echo ""
echo "=== Files imported via '@/' or other non-relative aliases ==="
grep -rEn "from [\"'\`]@/|require\([\"'\`]@/" --include='*.js' --include='*.ts' --include='*.tsx' --include='*.jsx' . 2>/dev/null \
  | grep -Ev "node_modules|/backups/|legacy_backup/|backup_old_ui/"

echo ""
echo "=== Files imported via dynamic require/import (template strings, variables) ==="
grep -rEn "require\(\`|require\([a-zA-Z_]|import\(\`|import\([a-zA-Z_]" --include='*.js' --include='*.ts' --include='*.tsx' --include='*.jsx' . 2>/dev/null \
  | grep -Ev "node_modules|/backups/|legacy_backup/|backup_old_ui/"

echo ""
echo "=== Express route registrations in server.js / app.js (to confirm which routes/controllers are live) ==="
grep -nE "require\(|app\.use\(|router\.use\(" server.js app.js 2>/dev/null
