#!/bin/bash
# Run from project root WHILE the server is running (npm start in another terminal).
# bash debug_register.sh
#
# This just fires one register request and prints the response.
# The REAL error will appear in the npm start terminal's stdout/stderr -
# scroll up there right after running this, or redirect npm start's output
# to a file (see note at bottom).

EMAIL="debugtest_$(date +%s)@example.com"
PASSWORD="TestPass123!"

echo "Registering: $EMAIL"
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"Debug\",\"lastName\":\"Test\"}" \
  -w "\n[HTTP %{http_code}]\n"

echo ""
echo "Now check the 'npm start' terminal for a stack trace printed just now."
echo ""
echo "TIP: to capture server output to a file for next time, stop the server (Ctrl+C)"
echo "and restart it with:"
echo "  npm start 2>&1 | tee server.log"
echo "Then re-run this script and: tail -50 server.log"
