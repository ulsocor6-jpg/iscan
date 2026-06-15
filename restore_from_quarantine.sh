#!/bin/bash
# Run from project root: bash restore_from_quarantine.sh path1 path2 ...
# Or: bash restore_from_quarantine.sh --all

set -e
QDIR="./_quarantine"

restore_one() {
  local f="$1"
  f="${f#./}"
  local src="$QDIR/$f"
  if [ ! -e "$src" ]; then
    echo "SKIP (not in quarantine): $f"
    return
  fi
  mkdir -p "$(dirname "$f")"
  git mv "$src" "$f" 2>/dev/null || mv "$src" "$f"
  echo "Restored: $f"
}

if [ "$1" = "--all" ]; then
  find "$QDIR" -type f | while read -r f; do
    rel="${f#$QDIR/}"
    restore_one "$rel"
  done
else
  for f in "$@"; do
    restore_one "$f"
  done
fi
