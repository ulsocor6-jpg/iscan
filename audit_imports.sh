#!/bin/bash
# Run from project root: bash audit_imports.sh
set -e
ROOT="."
EXCLUDE="node_modules|\.git|backups|backup_old_ui|legacy_backup"

echo "=== Candidate source files ==="
FILES=$(find "$ROOT" -type f \( -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.jsx' \) \
  | grep -Ev "$EXCLUDE")

echo "Total files: $(echo "$FILES" | wc -l)"
echo ""
echo "=== Files with ZERO references elsewhere (possible dead code) ==="

for f in $FILES; do
  base=$(basename "$f")
  name="${base%.*}"
  # search for the filename (with or without extension) being imported/required anywhere except itself
  hits=$(grep -rlE "(require\(['\"\`].*$name['\"\`]\)|from ['\"\`].*$name['\"\`])" "$ROOT" \
    --include='*.js' --include='*.ts' --include='*.tsx' --include='*.jsx' \
    2>/dev/null | grep -Ev "$EXCLUDE" | grep -v "^$f$" | wc -l)
  if [ "$hits" -eq 0 ]; then
    echo "UNUSED?  $f"
  fi
done

echo ""
echo "=== Duplicate basenames (case-insensitive) across the tree ==="
echo "$FILES" | xargs -n1 basename | tr 'A-Z' 'a-z' | sort | uniq -c | sort -rn | awk '$1>1'
