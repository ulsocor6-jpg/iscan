#!/bin/bash
# Run from project root: bash kill_and_restart.sh
echo "=== Killing all 'node server.js' processes ==="
pkill -9 -f "node server.js" && echo "  killed" || echo "  (none found)"

sleep 1

echo ""
echo "=== Confirming port 3000 is free ==="
lsof -i :3000 2>/dev/null && echo "  STILL IN USE" || echo "  port 3000 is free"

echo ""
echo "=== Now run: npm start 2>&1 | tee server.log ==="
