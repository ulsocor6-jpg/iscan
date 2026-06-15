#!/bin/bash
# Run from project root: bash audit_imports2.sh > audit_report2.txt
set -e
ROOT="."
EXCLUDE="node_modules|\.git/|/backups/|backup_old_ui/|legacy_backup/|\.bak"

# Known entrypoints / config files that are never require()'d by app code
ENTRYPOINTS="server.js|app.js|main.tsx|App.tsx|vite.config.js|server.backup.js"

FILES=$(find "$ROOT" -type f \( -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.jsx' \) \
  | grep -Ev "$EXCLUDE")

echo "Total files: $(echo "$FILES" | wc -l)"
echo ""
echo "=== Files with ZERO references elsewhere (possible dead code) ==="
echo "(entrypoints excluded automatically)"
echo ""

for f in $FILES; do
  base=$(basename "$f")
  name="${base%.*}"

  case "$base" in
    $ENTRYPOINTS) continue ;;
  esac

  # match require(...name) or from '...name' where name may be preceded by a path
  # and optionally followed by an extension, before the closing quote
  hits=$(grep -rlEi "(require\([\"'\`][^\"'\`]*${name}(\.(js|ts|tsx|jsx))?[\"'\`]\)|from[[:space:]]+[\"'\`][^\"'\`]*${name}(\.(js|ts|tsx|jsx))?[\"'\`])" \
    "$ROOT" --include='*.js' --include='*.ts' --include='*.tsx' --include='*.jsx' \
    2>/dev/null | grep -Ev "$EXCLUDE" | grep -vF "$f" | wc -l)

  if [ "$hits" -eq 0 ]; then
    echo "UNUSED?  $f"
  fi
done

echo ""
echo "=== Duplicate basenames (case-insensitive) across the tree ==="
echo "$FILES" | xargs -n1 basename | tr 'A-Z' 'a-z' | sort | uniq -c | sort -rn | awk '$1>1'

echo ""
echo "=== Sanity check: who requires server.js / app.js? (should be 0 - entrypoints) ==="
grep -rn "server\.js\|app\.js" --include='*.json' . 2>/dev/null | grep -Ev "$EXCLUDE" | grep -i "main\|start\|scripts" || echo "(none found in package.json scripts)"
