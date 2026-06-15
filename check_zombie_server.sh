#!/bin/bash
# Run from project root: bash check_zombie_server.sh
echo "=== Processes listening on port 3000 ==="
lsof -i :3000 2>/dev/null || ss -ltnp 2>/dev/null | grep 3000 || echo "(lsof/ss not available or nothing found)"

echo ""
echo "=== All node processes ==="
ps aux | grep "[n]ode"

echo ""
echo "=== Test with verbose curl (shows connection details, 5s max) ==="
curl -v --max-time 5 -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"verbosetest@example.com","password":"TestPass123!","firstName":"V","lastName":"T"}' 2>&1

echo ""
echo "=== GET / with verbose (sanity check - this worked before) ==="
curl -v --max-time 5 http://localhost:3000/ 2>&1 | tail -20
