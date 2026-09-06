# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**aifootball.am** — an Armenian-language football news site. Articles are written by an
LLM pipeline from English news sources and API-Football data, on a cron, without a human
in the loop; the owner also publishes hand-written pieces ("Opinions"). Everything a
reader sees is in Armenian.

It runs as a single Cloudflare Worker: a Next.js App Router app built by
[vinext](https://github.com/cloudflare/vinext), with Cloudflare D1 as the only database.
`aisport.am` is the previous domain and still redirects here.

## Repository layout

- `aisport-am/` — the site. Every command below runs from inside this directory.
- `audit.mjs`, `page-weight.mjs`, `vitals.mjs`, `make-social-images.mjs` (repo root) —
  Playwright tools that measure or photograph the **deployed** site, not a local build.
  They need `playwright` installed ad hoc; nothing at the root is an npm project.
- `.github/workflows/` — deploy, plus the cron jobs that drive content generation.

## Commands

```bash
npm ci                 # or npm run install:ci (one bounded, non-retrying install)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run build          # bash scripts/build-verified.sh -> dist/
npm test               # build, then node --test tests/rendered-html.test.mjs
npm run dev            # vite dev server (needs the D1 binding + API keys to be useful)
npm run db:generate    # drizzle-kit generate, after editing db/schema.ts
node scripts/smoke.mjs # open one page of every type on the live site (SMOKE_BASE_URL to point elsewhere)
```

There is one test file; `npm test` rebuilds first because the test imports `dist/server/index.js`.

**Always run `npm run typecheck` before pushing.** The bundler does not type-check, so an
identifier that does not exist compiles cleanly and then throws at request time as
Cloudflare error 1101 — that is how a crashing `/opinions/` page once reached production.
The deploy workflow fails on it, and `scripts/smoke.mjs` runs afterwards to catch what
types cannot see (a route that throws on real data, a page that 404s, a template that
renders empty).

## Deploy

Push to `main` → `.github/workflows/cloudflare-deploy.yml` → `npm ci`, typecheck,
`scripts/cf-deploy.sh`, smoke test. There is no `wrangler.jsonc`: the build generates
`dist/server/wrangler.json` and `cf-deploy.sh` patches it with the D1 database id, the
worker name (`aisport-am`), the routes for both domains, and the cron trigger, then
`wrangler deploy`, then writes the secrets and purges the edge cache. Develop on a
`claude/...` branch and open a PR — a push to `main` is a deploy.

## Architecture

### Runtime shape

- `worker/index.ts` is the Worker entry: it serves `/_vinext/image` through Cloudflare
  Images and hands everything else to the vinext app-router handler. Its `scheduled()`
  only warms the cache (see cron below).
- Secrets and bindings are read as `const { env } = await import("cloudflare:workers")`,
  never `process.env`. That import is the house pattern for reaching `DB` and every key.
- `db/index.ts` exposes `getDb()` (drizzle over D1); `db/schema.ts` holds the tables that
  have migrations in `drizzle/`. Several later tables (`api_cache`, `comments`,
  `opinions`, `apitube_unknown_person`) are created lazily with
  `CREATE TABLE IF NOT EXISTS` on first use instead, so a new deploy needs no migration
  step. Follow whichever pattern the table already uses.
- Nearly every page is `export const dynamic = "force-dynamic"`. Next's own caching is
  effectively off; caching is done by hand in the D1 `api_cache` table, keyed by
  `apifootball:v3:...`, with a `retry_after` for rate limits.

### The content pipeline

This is the part of the codebase that actually produces the site, and most of its
complexity is scar tissue from platform limits. Read the comments in
`app/api/cron/content/route.ts` and `worker/index.ts` before changing timing.

1. **Triggering.** cron-job.org (30s timeout) calls `/api/cron/dispatch`, which does no
   work — it dispatches GitHub Actions workflows and returns in under a second. GitHub
   Actions (`cron-content.yml`, `warm-cache.yml`, `backup-cron.yml`) then call
   `/api/cron/content` and `/api/cron/warm` with `?token=$CRON_TOKEN`. Cloudflare's own
   Cron Trigger only does the fast cache warm: its ~30s ceiling was killing generation,
   which routinely takes 40–85s.
2. **One mode per tick.** `/api/cron/content` rotates `recap | preview | rss` rather than
   doing all three, because Workers cap subrequests per invocation and match details
   alone cost 8–10.
3. **Finding a story.** RSS rows in the `sources` table, plus APITube — whose API key
   lives inside that row's `feed_url`, not in an env var. `lib/football-entities.ts` is
   the ordered club/person search chain (clubs are searched by title, people by
   `person.name`; APITube's taxonomy has no clubs).
4. **Writing it.** `lib/content-generation.ts` calls Gemini, with Anthropic (Claude
   Sonnet 5) behind it, each with a 100s timeout. `CONTENT_MODEL_PROVIDER=gemini` is
   re-pinned on every deploy so the primary provider is a property of `cf-deploy.sh`, not
   of a lingering secret. It was `claude` until 5 September and the site ran on the paid
   balance; Gemini's free tier allows twenty requests a day, and that number — not an
   editorial one — is why `/api/cron/content` publishes at most one article an hour
   inside a 10:00–03:00 Yerevan window. Seventeen a day, three in hand for a retry.
   Raising the rate means paying for it somewhere.

   That twenty is MEASURED, and it was doubted once. On 6 September the daily article
   counts — 43, 41, 40 on the 2nd to the 4th, with no 429 anywhere in
   `cron_invocations` — were read as proof that no such cap existed, and the gap was
   cut to 28 minutes. Those were **Claude's** days: `CONTENT_MODEL_PROVIDER` only
   became `gemini` on 5 September. The first full day under Gemini published five
   articles and then met Google's own words: *"Quota exceeded for metric:
   generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20"*.
   The hour went back the same afternoon. Do not compare one provider's output against
   another provider's limit; and note that with `CONTENT_MODEL_PROVIDER=gemini` a
   refusal loses the article outright — the Claude fallback runs the other way, and
   rescues a Claude billing failure with Gemini.
5. **Not repeating itself.** Exact source-URL dedup, plus a topic check that compares
   distinctive words in the headline against the last story used for that entity, with an
   entity cooldown — two outlets reporting the same transfer have different URLs.
6. **Saving.** `lib/articles.ts` `saveGeneratedArticle()`. Slugs go through
   `transliterateHy()` and must stay Latin: the first seven articles have Armenian-script
   slugs and are kept alive only by a closed redirect table in `middleware.ts`.

### Football data

`lib/football-server.ts`, `live-football-server.ts`, `live-match-details-v2.ts`,
`player-server.ts`, `squad-server.ts`, `topscorers-server.ts` all talk to API-Football v3
with `API_FOOTBALL_KEY` and cache into `api_cache`. `lib/entity-cache.ts` exists so a
team or player page whose fetch fails falls back to the name and badge already in the
cached standings/top-scorer rows — a page must not answer 404 for something that exists.

### Armenian names

Hand-written tables win, always: `team-names-hy.ts` (clubs), `player-names-hy.ts`,
`names-hy.ts` (countries and competitions). `translit-hy.ts` spells out by rule only what
the tables do not carry. Never put a country or competition through the club
transliterator.

### Images

Every remote image goes through `lib/image-proxy.ts` (`sizedImage`, `imageSrcSet`,
`shareImage`), which resizes and re-encodes via wsrv.nl — Cloudflare image transforms are
not enabled on this zone. `next/image` is not used; pages use `<img>` with an eslint
disable at the top. Do not hotlink a source's image directly.

### Domains and redirects

`middleware.ts` 301s `aisport.am` → `aifootball.am` and maps the seven legacy slugs, in
one hop. It deliberately excludes `/api`: an external cron service hitting the old host
did not follow the redirect and the whole pipeline silently stopped for hours.

### Editorial surfaces

`/control` and `/moderate` are gated on `?token=` matching `MODERATION_TOKEN`. Opinions
live in D1 (`lib/opinions.ts`) and are written through `/control/opinions`. Ad slots
render nothing at all while `ADS_ENABLED` is false in `components/ad-spaces.tsx`.

### Styling

One hand-written stylesheet, `app/globals.css`, with semantic class names
(`.aisport-logo`, `.headline-feed-item`) written densely — several rules per line, with a
prose comment above anything non-obvious. Tailwind is imported but no utility classes are
used. Theme colours are custom properties on `:root` / `html[data-theme="light"]`; the
light theme redefines the accents because the dark theme's bright green and orange are
unreadable on white. The brand mark is `components/brand-logo.tsx`, drawn as inline SVG
and shared with `public/favicon.svg`.

### Environment variables (Worker secrets)

`API_FOOTBALL_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `CONTENT_MODEL_PROVIDER`,
`CRON_TOKEN`, `CRONJOB_TOKEN`, `GH_DISPATCH_TOKEN`, `MODERATION_TOKEN`,
`FOOTBALL_DATA_TOKEN`. They are set by `cf-deploy.sh` from GitHub Actions secrets.

## Conventions

- **Comments say why, not what**, and usually name the incident: what broke, what was
  observed, what was tried and rejected. This is how the reasoning survives between
  sessions — keep writing them that way, and when you fix a production bug, leave the
  cause behind in the code.
- **Commit subjects are one plain sentence saying what the change accomplishes** —
  "Stop the same story being published twice", "Pick the manager who started last, not the
  one listed first" — with the body explaining the cause. No prefixes, no ticket numbers.
- The site is Armenian: user-visible strings, dates (`lib/format-date.ts`) and error
  messages are written in Armenian.
