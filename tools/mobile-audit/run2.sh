#!/usr/bin/env bash
# Serve locally, mint a preview ticket straight into the miniflare D1 file,
# and drive the shipping components at phone viewports headlessly.
set -uo pipefail
cd /tmp/lf
export LD_LIBRARY_PATH=/sessions/nifty-festive-hypatia/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1

npx vite --port 5199 --host 127.0.0.1 > /tmp/dev.log 2>&1 &
DEV_PID=$!
trap 'kill "$DEV_PID" 2>/dev/null' EXIT

code=000
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 --noproxy '*' http://127.0.0.1:5199/home || true)
  [ "$code" = "200" ] && break
  sleep 3
done
echo "server: $code"
[ "$code" != "200" ] && { tail -10 /tmp/dev.log; exit 1; }

# The dev server creates the D1 file on first boot; write the ticket into it.
DB=$(ls -S .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite 2>/dev/null | grep -v metadata | head -1)
TICKET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
NOW=$(date +%s)
node -e '
const Database = require("node:sqlite").DatabaseSync;
const db = new Database(process.argv[1]);
db.exec("CREATE TABLE IF NOT EXISTS dev_preview_tickets (ticket TEXT PRIMARY KEY, minted_by TEXT NOT NULL, minted_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)");
db.prepare("INSERT OR REPLACE INTO dev_preview_tickets VALUES (?,?,?,?)")
  .run(process.argv[2], "local-audit", Number(process.argv[3]), Number(process.argv[3]) + 3000);
db.close();
' "$DB" "$TICKET" "$NOW" 2>&1 | tail -3
echo "ticket rows: $(node -e 'const D=require("node:sqlite").DatabaseSync;const d=new D(process.argv[1]);console.log(d.prepare("SELECT COUNT(*) c FROM dev_preview_tickets").get().c)' "$DB" 2>/dev/null)"

export TICKET
node ${AUDIT_SCRIPT:-tools/mobile-audit/mobile-audit.mjs} 2>&1 | grep -v 'Skipping host requirements'
