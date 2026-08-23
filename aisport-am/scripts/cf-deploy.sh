#!/usr/bin/env bash
set -euo pipefail

DB_NAME="aisport-db"
WORKER_NAME="aisport-am"
DOMAIN="aisport.am"

chmod +x scripts/*.sh 2>/dev/null || true

echo "== Checking for existing D1 database '$DB_NAME' =="
LIST_OUTPUT="$(npx wrangler d1 list 2>/dev/null || true)"
DB_ID="$(echo "$LIST_OUTPUT" | grep -F "$DB_NAME" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"

if [ -z "$DB_ID" ]; then
  echo "== D1 database not found, creating it =="
  CREATE_OUTPUT="$(npx wrangler d1 create "$DB_NAME")"
  echo "$CREATE_OUTPUT"
  DB_ID="$(echo "$CREATE_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
fi

if [ -z "$DB_ID" ]; then
  echo "ERROR: could not determine D1 database id" >&2
  exit 1
fi

echo "== Using D1 database id: $DB_ID =="

echo "== Building the site =="
npm run build

echo "== Patching generated wrangler config for production deploy =="
DB_ID="$DB_ID" WORKER_NAME="$WORKER_NAME" DOMAIN="$DOMAIN" node -e '
const fs = require("fs");
const path = "dist/server/wrangler.json";
const cfg = JSON.parse(fs.readFileSync(path, "utf8"));
cfg.name = process.env.WORKER_NAME;
cfg.d1_databases = [{ binding: "DB", database_name: "aisport-db", database_id: process.env.DB_ID }];
cfg.routes = [{ pattern: `${process.env.DOMAIN}/*`, zone_name: process.env.DOMAIN }];
cfg.triggers = { crons: ["*/5 * * * *"] };
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log("Patched wrangler.json:", JSON.stringify(cfg, null, 2));
'

echo "== Deploying to Cloudflare Workers =="
npx wrangler deploy -c dist/server/wrangler.json

if [ -n "${FOOTBALL_DATA_TOKEN:-}" ]; then
  echo "== Setting FOOTBALL_DATA_TOKEN secret on the worker =="
  echo "$FOOTBALL_DATA_TOKEN" | npx wrangler secret put FOOTBALL_DATA_TOKEN --name "$WORKER_NAME"
fi

if [ -n "${API_FOOTBALL_KEY:-}" ]; then
  echo "== Setting API_FOOTBALL_KEY secret on the worker =="
  echo "$API_FOOTBALL_KEY" | npx wrangler secret put API_FOOTBALL_KEY --name "$WORKER_NAME"
fi

if [ -n "${CRON_TOKEN:-}" ]; then
  echo "== Setting CRON_TOKEN secret on the worker =="
  echo "$CRON_TOKEN" | npx wrangler secret put CRON_TOKEN --name "$WORKER_NAME"
fi

echo "== Deploy complete =="
