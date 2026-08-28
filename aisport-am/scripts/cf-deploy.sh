#!/usr/bin/env bash
set -euo pipefail

DB_NAME="aisport-db"
WORKER_NAME="aisport-am"
DOMAIN="aisport.am"
NEW_DOMAIN="aifootball.am"

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
echo "== Checking whether $NEW_DOMAIN zone is active in Cloudflare =="
NEW_DOMAIN_ACTIVE="false"
if [ -n "${CLOUDFLARE_PURGE_TOKEN:-}" ]; then
  ZONE_STATUS="$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${NEW_DOMAIN}" \
    -H "Authorization: Bearer ${CLOUDFLARE_PURGE_TOKEN}" \
    -H "Content-Type: application/json" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log(j.result?.[0]?.status||"none")}catch{console.log("none")}})')"
  echo "$NEW_DOMAIN zone status: $ZONE_STATUS"
  if [ "$ZONE_STATUS" = "active" ]; then
    NEW_DOMAIN_ACTIVE="true"
  fi
else
  echo "CLOUDFLARE_PURGE_TOKEN not set, cannot check - skipping $NEW_DOMAIN route to be safe"
fi

DB_ID="$DB_ID" WORKER_NAME="$WORKER_NAME" DOMAIN="$DOMAIN" NEW_DOMAIN="$NEW_DOMAIN" NEW_DOMAIN_ACTIVE="$NEW_DOMAIN_ACTIVE" node -e '
const fs = require("fs");
const path = "dist/server/wrangler.json";
const cfg = JSON.parse(fs.readFileSync(path, "utf8"));
cfg.name = process.env.WORKER_NAME;
cfg.d1_databases = [{ binding: "DB", database_name: "aisport-db", database_id: process.env.DB_ID }];
cfg.routes = [{ pattern: `${process.env.DOMAIN}/*`, zone_name: process.env.DOMAIN }];
if (process.env.NEW_DOMAIN_ACTIVE === "true") {
  cfg.routes.push({ pattern: `${process.env.NEW_DOMAIN}/*`, zone_name: process.env.NEW_DOMAIN });
  console.log(`Adding route for ${process.env.NEW_DOMAIN} (zone confirmed active)`);
} else {
  console.log(`Skipping route for ${process.env.NEW_DOMAIN} (zone not yet active) - only ${process.env.DOMAIN} will be routed this deploy`);
}
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

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "== Setting ANTHROPIC_API_KEY secret on the worker =="
  echo "$ANTHROPIC_API_KEY" | npx wrangler secret put ANTHROPIC_API_KEY --name "$WORKER_NAME"
fi

echo "== Deploy complete =="

echo "== Purging Cloudflare edge cache =="
if [ -n "${CLOUDFLARE_PURGE_TOKEN:-}" ]; then
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/0cfdb0280564b0d8a244a21835bfc724/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_PURGE_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' | grep -o '"success":[^,}]*'
  if [ "$NEW_DOMAIN_ACTIVE" = "true" ]; then
    NEW_ZONE_ID="$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${NEW_DOMAIN}" \
      -H "Authorization: Bearer ${CLOUDFLARE_PURGE_TOKEN}" \
      -H "Content-Type: application/json" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log(j.result?.[0]?.id||"")}catch{console.log("")}})')"
    if [ -n "$NEW_ZONE_ID" ]; then
      echo "== Purging $NEW_DOMAIN edge cache (zone $NEW_ZONE_ID) =="
      curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${NEW_ZONE_ID}/purge_cache" \
        -H "Authorization: Bearer ${CLOUDFLARE_PURGE_TOKEN}" \
        -H "Content-Type: application/json" \
        --data '{"purge_everything":true}' | grep -o '"success":[^,}]*'
    fi
  fi
else
  echo "CLOUDFLARE_PURGE_TOKEN not set, skipping cache purge"
fi
