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
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  ZONE_STATUS="$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${NEW_DOMAIN}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log(j.result?.[0]?.status||"none")}catch{console.log("none")}})')"
  echo "$NEW_DOMAIN zone status: $ZONE_STATUS"
  if [ "$ZONE_STATUS" = "active" ]; then
    NEW_DOMAIN_ACTIVE="true"
  fi
else
  echo "CLOUDFLARE_API_TOKEN not set, cannot check - skipping $NEW_DOMAIN route to be safe"
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

# The page id and its access token: with both present the content pipeline
# posts every new article to the Facebook page, with neither it does not.
# Nothing else changes either way, so an expired token degrades to the site
# publishing exactly as it did before.
if [ -n "${META_PAGE_ID:-}" ]; then
  echo "== Setting META_PAGE_ID secret on the worker =="
  echo "$META_PAGE_ID" | npx wrangler secret put META_PAGE_ID --name "$WORKER_NAME"
fi

if [ -n "${META_PAGE_ACCESS_TOKEN:-}" ]; then
  echo "== Setting META_PAGE_ACCESS_TOKEN secret on the worker =="
  echo "$META_PAGE_ACCESS_TOKEN" | npx wrangler secret put META_PAGE_ACCESS_TOKEN --name "$WORKER_NAME"
fi

if [ -n "${GEMINI_API_KEY:-}" ]; then
  echo "== Setting GEMINI_API_KEY secret on the worker =="
  echo "$GEMINI_API_KEY" | npx wrangler secret put GEMINI_API_KEY --name "$WORKER_NAME"
fi

# Pinned explicitly rather than left unset. A worker secret survives being
# removed from this script, so whichever provider is named here has to be
# named on every deploy; deleting the line would leave the stored secret
# saying whatever it last said. Writing it each time makes the primary
# provider a property of this file, so switching is a one-line change.
#
# 5 September: switched to gemini. The Anthropic balance is down to ten
# cents and Tigran is deciding whether to keep paying for the site at all,
# so generation runs on Gemini's free tier until that is settled. This is
# the scenario lib/content-generation.ts was built for.
#
# It is a downgrade, not a like-for-like swap, and the cost is worth
# writing down: Gemini is the cheaper model and carries the hazard Haiku
# already demonstrated here - it once returned an opera review in place of
# a footballer - while parseArticleJson only checks that the JSON is well
# formed, never that the article is about the story it was given. Nothing
# else catches it. Read the site.
#
# Change this word back to "claude" to revert; nothing else needs touching.
echo "== Pinning CONTENT_MODEL_PROVIDER=gemini on the worker =="
echo "gemini" | npx wrangler secret put CONTENT_MODEL_PROVIDER --name "$WORKER_NAME"

echo "== Deploy complete =="

echo "== Purging Cloudflare edge cache =="
if [ -n "${CLOUDFLARE_PURGE_TOKEN:-}" ]; then
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/0cfdb0280564b0d8a244a21835bfc724/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_PURGE_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' | grep -o '"success":[^,}]*'
  if [ "$NEW_DOMAIN_ACTIVE" = "true" ]; then
    NEW_ZONE_ID="$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=${NEW_DOMAIN}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);console.log(j.result?.[0]?.id||"")}catch{console.log("")}})')"
    if [ -n "$NEW_ZONE_ID" ]; then
      echo "== Purging $NEW_DOMAIN edge cache (zone $NEW_ZONE_ID) =="
      # This purge has been failing with "success":false while the
      # aisport.am one succeeds, i.e. CLOUDFLARE_PURGE_TOKEN was scoped to
      # the old zone only and never granted the new one. aifootball.am is
      # now the live domain, so a stale edge cache there delays every new
      # article for real visitors. Print the actual API error instead of
      # just the success flag, and retry with CLOUDFLARE_API_TOKEN, which
      # demonstrably does reach this zone - the zone-id lookup just above
      # uses it. Falls back cleanly if that token lacks purge rights too.
      PURGE_RESP="$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${NEW_ZONE_ID}/purge_cache" \
        -H "Authorization: Bearer ${CLOUDFLARE_PURGE_TOKEN}" \
        -H "Content-Type: application/json" \
        --data '{"purge_everything":true}')"
      echo "$PURGE_RESP" | grep -o '"success":[^,}]*'
      if ! echo "$PURGE_RESP" | grep -q '"success":true'; then
        echo "purge token failed for $NEW_DOMAIN: $(echo "$PURGE_RESP" | head -c 300)"
        echo "== Retrying $NEW_DOMAIN purge with CLOUDFLARE_API_TOKEN =="
        RETRY_RESP="$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${NEW_ZONE_ID}/purge_cache" \
          -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
          -H "Content-Type: application/json" \
          --data '{"purge_everything":true}')"
        echo "$RETRY_RESP" | grep -o '"success":[^,}]*'
        if ! echo "$RETRY_RESP" | grep -q '"success":true'; then
          echo "retry also failed: $(echo "$RETRY_RESP" | head -c 300)"
          echo "ACTION NEEDED: no available token can purge the $NEW_DOMAIN zone."
        fi
      fi
    fi
  fi
else
  echo "CLOUDFLARE_PURGE_TOKEN not set, skipping cache purge"
fi
# redeploy trigger: purge the edge cache after correcting article 257
# directly in D1, which does not itself trigger a deploy 2026-09-02T11:15:00Z
