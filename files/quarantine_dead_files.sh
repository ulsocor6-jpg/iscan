#!/bin/bash
# Run from project root: bash quarantine_dead_files.sh path1 path2 ...
#
# Moves the given files into ./_quarantine/<original path> preserving structure,
# so nothing is permanently deleted. Review _quarantine/, then git add -A && git commit,
# or delete it once you're confident.
#
# Usage:
#   bash quarantine_dead_files.sh ./server.backup.js ./src/services/cashoutService.js ...
#
# Or feed it a file containing one path per line:
#   bash quarantine_dead_files.sh --from-file dead_list.txt

set -e

QDIR="./_quarantine"
mkdir -p "$QDIR"

move_one() {
  local f="$1"
  f="${f#./}"
  if [ ! -e "$f" ]; then
    echo "SKIP (not found): $f"
    return
  fi
  local dest="$QDIR/$f"
  mkdir -p "$(dirname "$dest")"
  git mv "$f" "$dest" 2>/dev/null || mv "$f" "$dest"
  echo "Quarantined: $f -> $dest"
}

if [ "$1" = "--from-file" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    move_one "$line"
  done < "$2"
else
  for f in "$@"; do
    move_one "$f"
  done
fi

echo ""
echo "Done. Review ./_quarantine, run your build/tests, then:"
echo "  - if all good: rm -rf ./_quarantine && git add -A && git commit -m 'Remove dead code'"
echo "  - if something broke: bash restore_from_quarantine.sh <path>"
