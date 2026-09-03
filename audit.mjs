// Verify the Armenian-names and clickable-lineup deploy, and probe whether
// Cloudflare can resize images for us before deciding how to cut page weight.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://aifootball.am";
const OUT = "audit";
fs.mkdirSync(OUT, { recursive: true });
const report = [];
const log = (s) => { console.log(s); report.push(s); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 } });
const page = await ctx.newPage();

// 1. The player page the complaint came from.
for (const id of [47323, 1485]) {
  await page.goto(`${BASE}/player/${id}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => ({
    title: document.querySelector("h1")?.textContent?.trim(),
    facts: [...document.querySelectorAll(".player-facts span")].map((s) => s.textContent?.trim()),
    leagues: [...document.querySelectorAll(".standings-table tbody tr td:first-child")].map((t) => t.textContent?.trim()),
    dates: [...document.querySelectorAll(".transfer-date")].slice(0, 3).map((t) => t.textContent?.trim()),
    latin: (document.body.innerText.match(/[A-Za-z]{3,}/g) ?? []).filter((w) => !["MLS","FA","UEFA","AIFootball","am"].includes(w)).slice(0, 15),
  }));
  log(`\n=== /player/${id} — ${m.title} ===`);
  log(`  facts: ${m.facts.join(" | ")}`);
  log(`  competitions: ${m.leagues.join(" | ")}`);
  log(`  transfer dates: ${m.dates.join(" | ")}`);
  log(`  latin words still on the page: ${m.latin.join(", ")}`);
  await page.screenshot({ path: `${OUT}/player-${id}.jpg`, type: "jpeg", quality: 70, fullPage: false });
}

// 2. Header date, which used to print in English.
await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);
log(`\n=== header ===`);
log(`  date line: ${await page.evaluate(() => {
  const hit = [...document.querySelectorAll(".topline-inner span")]
    .map((s) => s.textContent?.trim() ?? "")
    .find((t) => /\d/.test(t) && t.length > 5);
  return hit ?? "not found";
})}`);

// 3. A live-match modal: are the lineup names links now? Lineups only exist
// close to kickoff, and today's fixtures have not published any, so look at
// the past few days as well. Ask the site's own API first - that is a cheap
// way to find a match that actually has a lineup, and it also shows whether
// the player id we now depend on is present in the data at all.
const dayOffset = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
};
// On /live a match row is a div with a router.push, not an anchor, so
// there is nothing for a href selector to find - which is why the earlier
// runs only ever saw the eight links on the home page. Read the ids out of
// the served HTML instead.
const candidates = [];
for (const path of ["/live", `/live?date=${dayOffset(-4)}`, `/live?date=${dayOffset(-5)}`, `/live?date=${dayOffset(-3)}`, `/live?date=${dayOffset(-6)}`, "/"]) {
  const res = await page.request.get(BASE + path, { timeout: 60000 }).catch(() => null);
  if (!res || !res.ok()) continue;
  const html = await res.text();
  for (const id of new Set(html.match(/af-\d{5,}/g) ?? [])) if (!candidates.includes(id)) candidates.push(id);
}
log(`\n=== match modal — ${candidates.length} match ids found ===`);
let withLineup = null;
for (const id of candidates.slice(0, 40)) {
  const res = await page.request.get(`${BASE}/api/live/match/${id}`, { timeout: 60000 }).catch(() => null);
  if (!res || !res.ok()) continue;
  const data = await res.json().catch(() => null);
  const starters = data?.lineups?.[0]?.starters ?? [];
  if (!starters.length) continue;
  const withId = starters.filter((p) => p.id).length;
  log(`  ${id}: ${data.lineups.length} lineups, ${starters.length} starters, ${withId} of them carry a player id`);
  log(`    first starter: ${JSON.stringify(starters[0])}`);
  if (withId > 0) { withLineup = `/live?match=${id}`; break; }
}
if (!withLineup) {
  log(`  no match with a published lineup in that window - the links cannot be checked in the page yet`);
} else {
  await page.goto(new URL(withLineup, BASE).toString(), { waitUntil: "load", timeout: 60000 });
  const tab = page.locator("button", { hasText: "Կազմեր" }).first();
  await tab.waitFor({ state: "visible", timeout: 40000 }).catch(() => {});
  await tab.click().catch(() => {});
  await page.waitForTimeout(4000);
  const m = await page.evaluate(() => ({
    pitchPlayers: document.querySelectorAll(".pitch-player").length,
    pitchLinks: document.querySelectorAll("a.pitch-player-link").length,
    subs: document.querySelectorAll(".subs-chip").length,
    subLinks: document.querySelectorAll("a.subs-chip-link").length,
    teams: [...document.querySelectorAll(".pitch-team-label strong")].map((t) => t.textContent?.trim()),
    firstHref: document.querySelector("a.pitch-player-link")?.getAttribute("href") ?? null,
  }));
  log(`  rendered: ${m.teams.join(" vs ")}`);
  log(`    pitch ${m.pitchLinks}/${m.pitchPlayers} names are links | subs ${m.subLinks}/${m.subs} | first ${m.firstHref}`);
  await page.screenshot({ path: `${OUT}/lineup.jpg`, type: "jpeg", quality: 70 });
  if (m.firstHref) {
    await page.goto(new URL(m.firstHref, BASE).toString(), { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(1500);
    log(`    following it lands on: ${await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "404")}`);
  }
}

// 4. Can Cloudflare resize a remote image for us? This decides whether the
// page-weight fix is "defer the images" or "serve them smaller".
const probe = "https://media.api-sports.io/football/teams/33.png";
for (const url of [`${BASE}/cdn-cgi/image/width=80,format=auto/${probe}`, probe]) {
  const res = await page.request.get(url).catch((e) => ({ status: () => `error ${e.message.slice(0, 60)}`, headers: () => ({}) }));
  const headers = typeof res.headers === "function" ? res.headers() : {};
  log(`\n  ${url.slice(0, 70)}\n    status ${res.status()} type ${headers["content-type"] ?? "?"} length ${headers["content-length"] ?? "?"}`);
}

{
  const p2 = await ctx.newPage();
  const res = [];
  p2.on("response", async (r) => {
    const type = (r.headers()["content-type"] ?? "").split(";")[0];
    let size = Number(r.headers()["content-length"] ?? 0);
    if (!size) { try { size = (await r.body()).length; } catch { size = 0; } }
    if (size > 0) res.push({ size, type });
  });
  await p2.setViewportSize({ width: 390, height: 844 });
  await p2.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await p2.waitForTimeout(3000);
  const total = res.reduce((n, r) => n + r.size, 0);
  const img = res.filter((r) => r.type.startsWith("image/"));
  const counted = await p2.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    return { inDom: imgs.length, lazy: imgs.filter((i) => i.getAttribute("loading") === "lazy").length };
  });
  log(`\n=== home page weight after the lazy pass (phone) ===`);
  log(`  ${(total / 1024 / 1024).toFixed(2)} MB total, images ${img.length} files / ${(img.reduce((n, r) => n + r.size, 0) / 1024 / 1024).toFixed(2)} MB (was 2.20 MB / 13 files / 1.13 MB)`);
  log(`  <img> in the DOM: ${counted.inDom} | lazy: ${counted.lazy} (was 48 | 26)`);
}

await browser.close();
fs.writeFileSync("add-source-result.txt", report.join("\n"));
