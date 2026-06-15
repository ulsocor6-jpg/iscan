#!/bin/bash
# Run from project root: bash add_request_logger.sh
set -e

TS=$(date +%Y%m%d_%H%M%S)
BACKUP="./_backup_$TS"
mkdir -p "$BACKUP"
cp -a app.js "$BACKUP/"
cp -a src/routes/authRoutes.js "$BACKUP/" 2>/dev/null || true

python3 - << 'PYEOF'
path = "app.js"
with open(path) as f:
    content = f.read()

old = """const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));"""

new = """const app = express();

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url} - incoming`);
  next();
});

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url} - after json parser, body=`, req.body);
  next();
});

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));"""

if old not in content:
    raise SystemExit("Pattern not found in app.js - aborting")

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("  added request-tracing middleware to app.js")
PYEOF

echo ""
echo "=== Done ==="
echo "Backups in: $BACKUP/"
echo "Restart: npm start 2>&1 | tee server.log"
echo "Then: bash debug_register.sh"
echo "Then: tail -50 server.log"
