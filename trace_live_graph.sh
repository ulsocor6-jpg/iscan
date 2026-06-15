#!/bin/bash
# Run from project root: bash trace_live_graph.sh > live_graph_report.txt
#
# Starts from server.js and app.js, follows require()/import chains recursively,
# and prints every file actually reachable from the app's entrypoints.
# Anything in src/, public/, etc NOT in this list is a strong dead-code candidate
# (much stronger signal than the basename regex approach).

set -e

VISITED=/tmp/iscan_visited.txt
QUEUE=/tmp/iscan_queue.txt
> "$VISITED"
> "$QUEUE"

# seed with entrypoints that exist
for f in server.js app.js src/main.tsx; do
  if [ -f "$f" ]; then echo "./$f" >> "$QUEUE"; fi
done

resolve() {
  # $1 = importing file, $2 = raw import path
  local from="$1" imp="$2"
  case "$imp" in
    .*|/*)
      local dir
      dir=$(dirname "$from")
      local candidate
      candidate=$(realpath -m "$dir/$imp" 2>/dev/null) || return
      for ext in "" .js .ts .tsx .jsx /index.js /index.ts; do
        if [ -f "${candidate}${ext}" ]; then
          # print relative to project root
          realpath --relative-to=. "${candidate}${ext}"
          return
        fi
      done
      ;;
    *) return ;; # skip node_modules / bare / alias imports
  esac
}

while [ -s "$QUEUE" ]; do
  current=$(head -1 "$QUEUE")
  sed -i '1d' "$QUEUE"

  current=$(realpath --relative-to=. "$current" 2>/dev/null) || continue
  [ -f "$current" ] || continue
  grep -qxF "$current" "$VISITED" && continue
  echo "$current" >> "$VISITED"

  # extract import/require targets
  grep -oE "(require\([\"'\`][^\"'\`]+[\"'\`]\)|from[[:space:]]+[\"'\`][^\"'\`]+[\"'\`])" "$current" 2>/dev/null \
  | sed -E "s/.*[\"'\`]([^\"'\`]+)[\"'\`].*/\1/" \
  | while read -r imp; do
      target=$(resolve "$current" "$imp")
      if [ -n "$target" ]; then
        echo "$target" >> "$QUEUE"
      fi
    done
done

echo "=== Files REACHABLE from server.js / app.js / main.tsx (live code) ==="
sort "$VISITED"
echo ""
echo "Total live files: $(wc -l < "$VISITED")"

echo ""
echo "=== All src/public/core/etc JS-ish files NOT in the live graph (strong dead-code candidates) ==="
find ./src ./public ./core ./middleware ./security ./config ./scripts \
  -type f \( -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.jsx' \) 2>/dev/null \
  | grep -Ev "node_modules|/backups/|backup_old_ui/|legacy_backup/" \
  | sed 's#^\./##' \
  | sort > /tmp/iscan_all.txt

comm -23 /tmp/iscan_all.txt <(sed 's#^\./##' "$VISITED" | sort) 
