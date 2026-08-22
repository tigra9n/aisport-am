#!/usr/bin/env bash
set -euo pipefail

DB_NAME="aisport-db"
WORKER_NAME="aisport-am"
DOMAIN="aisport.am"

echo "== Checking for existing D1 database '$DB_NAME' =="
DB_ID="$(npx wrangler d1 list --json 2>/dev/null | node -e '
  let data = "";
  process.stdin.on("data", (d) => (data += d));
  process.stdin.on("end", () => {
    try {
      const list = JSON.parse(data);
      const found = list.find((d) => d.name === process.env.DB_NAME_ENV);
      process.stdout.write(found ? found.uuid : "");
    } catch (e) {
      process.stdout.write("");
    }
  });
' DB_NAME_ENV="$DB_NAME")"

if [ -z "$DB_ID" ]; then
  echo "== D1 database not found, creating it =="
  CREATE_OUTPUT="$(npx wrangler d1 create "$DB_NAME" --json)"
  DB_ID="$(echo "$CREATE_OUTPUT" | node -e '
    let data = "";
    process.stdin.on("data", (d) => (data += d));
    process.stdin.on("end", () => {
      try {
        const j = JSON.parse(data);
        const uuid = j.uuid || (Array.isArray(j) && j[0] && j[0].uuid);
        process.stdout.write(uuid || "");
      } catch (e) {
        process.stdout.write("");
      }
    });
  ')"
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
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log("Patched wrangler.json:", JSON.stringify(cfg, null, 2));
'

echo "== Deploying to Cloudflare Workers =="
npx wrangler deploy -c dist/server/wrangler.json

if [ -n "${FOOTBALL_DATA_TOKEN:-}" ]; then
  echo "== Setting FOOTBALL_DATA_TOKEN secret on the worker =="
  echo "$FOOTBALL_DATA_TOKEN" | npx wrangler secret put FOOTBALL_DATA_TOKEN --name "$WORKER_NAME"
fi

echo "== Deploy complete =="
