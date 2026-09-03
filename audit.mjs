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

// 3. The lineup links are confirmed working (22 of 22 on the pitch, and
// following one reaches the player page), so this no longer walks 86
// matches on every run. It re-checks the one match that was verified.
{
  const id = "af-1581509";
  const res = await page.request.get(`${BASE}/api/live/match/${id}`, { timeout: 60000 }).catch(() => null);
  const data = res && res.ok() ? await res.json().catch(() => null) : null;
  const starters = data?.lineups?.[0]?.starters ?? [];
  log(`\n=== lineup ids (${id}) ===`);
  log(`  ${starters.filter((p) => p.id).length} of ${starters.length} starters carry a player id`);
}

// 4. Does the image proxy actually work, and how much does it save? This
// runs before the change is deployed: pointing every image on the site at a
// third-party resizer is not something to ship on the strength of its
// documentation.
{
  log(`\n=== image proxy ===`);
  const samples = [
    ["home hero (Getty)", "https://media.gettyimages.com/id/2291748685/photo/fc-ararat-armenia-v-cs-universitatea-craiova-uefa-europa-conference.jpg", 1400],
    ["bundesliga", "https://assets.bundesliga.com/contender/2026/8/imago1082300419.jpg", 840],
    ["team badge", "https://media.api-sports.io/football/teams/33.png", 280],
  ];
  for (const [label, url, width] of samples) {
    const proxied = `https://wsrv.nl/?${new URLSearchParams({ url, w: String(width), q: "72", output: "webp", we: "", default: url }).toString()}`;
    const sizeOf = async (u) => {
      const r = await page.request.get(u, { timeout: 45000 }).catch(() => null);
      if (!r) return "unreachable";
      const body = await r.body().catch(() => null);
      return `${r.status()} ${r.headers()["content-type"] ?? "?"} ${body ? Math.round(body.length / 1024) + " KB" : "?"}`;
    };
    log(`  ${label}`);
    log(`    original: ${await sizeOf(url)}`);
    log(`    proxied : ${await sizeOf(proxied)}`);
  }
}

// 5. Did the indexing signals actually reach the served HTML? Search
// Console named the cause - 83 pages "duplicate, no canonical chosen" -
// and a deploy reporting success is not evidence that the tags are there.
{
  log(`\n=== indexing signals in the served HTML ===`);
  const pages = [
    ["home", "/", "https://aifootball.am/", false],
    ["search", "/search?q=%D4%B2%D5%A1%D6%80%D5%BD%D5%A5%D5%AC%D5%B8%D5%B6%D5%A1", "https://aifootball.am/search", true],
    ["opinions", "/opinions", "https://aifootball.am/opinions", false],
    ["podcasts", "/podcasts", "https://aifootball.am/podcasts", false],
    ["league PL", "/league/PL", "https://aifootball.am/league/PL", false],
  ];
  for (const [name, path, expectCanonical, expectNoindex] of pages) {
    const res = await page.request.get(BASE + path, { timeout: 45000 }).catch(() => null);
    if (!res || !res.ok()) { log(`  ${name}: HTTP ${res ? res.status() : "unreachable"}`); continue; }
    const html = await res.text();
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1]
      ?? html.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/)?.[1] ?? null;
    const robots = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/)?.[1] ?? null;
    const okCanonical = canonical === expectCanonical;
    const okRobots = expectNoindex ? /noindex/.test(robots ?? "") : !/noindex/.test(robots ?? "");
    log(`  ${name}: canonical ${okCanonical ? "OK" : "WRONG"} (${canonical ?? "missing"}) | robots ${okRobots ? "OK" : "WRONG"} (${robots ?? "none"})`);
  }
  const sm = await page.request.get(`${BASE}/sitemap.xml`, { timeout: 45000 }).catch(() => null);
  if (sm && sm.ok()) {
    const xml = await sm.text();
    log(`  sitemap: ${(xml.match(/<url>/g) ?? []).length} urls | league pages ${(xml.match(/\/league\//g) ?? []).length} | contains /search: ${xml.includes("aifootball.am/search")}`);
  }
}

// 6. Broken internal links. Search Console reports three 404s and does not
// say which; the ones that matter are the ones the site links to itself,
// because those are what a crawler walks into.
{
  log(`\n=== internal links ===`);
  const seeds = ["/", "/category/football", "/league/PL", "/standings", "/live", "/opinions", "/armenia", "/topscorers"];
  const links = new Set();
  for (const seed of seeds) {
    const res = await page.request.get(BASE + seed, { timeout: 45000 }).catch(() => null);
    if (!res || !res.ok()) { log(`  seed ${seed}: HTTP ${res ? res.status() : "unreachable"}`); continue; }
    const html = await res.text();
    for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
      const href = m[1];
      if (href.startsWith("/_") || href.startsWith("/assets/") || href.endsWith(".svg") || href.endsWith(".xml") || href.endsWith(".txt")) continue;
      links.add(href);
    }
  }
  log(`  ${links.size} distinct internal links found across ${seeds.length} pages`);
  const bad = [];
  const list = [...links];
  for (let i = 0; i < list.length; i += 8) {
    await Promise.all(list.slice(i, i + 8).map(async (href) => {
      const r = await page.request.get(BASE + href, { timeout: 45000, maxRedirects: 0 }).catch(() => null);
      const status = r ? r.status() : 0;
      if (status >= 400 || status === 0) bad.push(`${status} ${href}`);
    }));
  }
  if (!bad.length) log(`  every one of them answers`);
  else {
    log(`  BROKEN under 8-at-a-time: ${bad.length}`);
    for (const b of bad.slice(0, 15)) log(`    ${b}`);

    // The API has data for these ids - checked directly - so the page is
    // failing to read what it is sent rather than being asked for something
    // that does not exist. Before fixing that, rule out the checker itself:
    // eight pages at once, each making its own API calls, is not how a
    // reader arrives. Google reported three of these, not fourteen.
    log(`  now one at a time, a second apart:`);
    for (const entry of bad.slice(0, 15)) {
      const href = entry.split(" ")[1];
      await new Promise((r) => setTimeout(r, 1000));
      const first = await page.request.get(BASE + href, { timeout: 45000 }).catch(() => null);
      await new Promise((r) => setTimeout(r, 1000));
      const second = await page.request.get(BASE + href, { timeout: 45000 }).catch(() => null);
      log(`    ${href}: ${first ? first.status() : "err"} then ${second ? second.status() : "err"}`);
    }
  }
}

// 7. Can Cloudflare resize a remote image for us? This decides whether the
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
    if (size > 0) res.push({ size, type, url: r.url() });
  });
  await p2.setViewportSize({ width: 390, height: 844 });
  await p2.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await p2.waitForTimeout(3000);
  const total = res.reduce((n, r) => n + r.size, 0);
  const img = res.filter((r) => r.type.startsWith("image/"));
  const counted = await p2.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc);
    return {
      inDom: imgs.length,
      lazy: imgs.filter((i) => i.getAttribute("loading") === "lazy").length,
      proxied: imgs.filter((i) => (i.currentSrc || "").includes("wsrv.nl")).length,
      broken: broken.length,
      brokenSrc: broken.slice(0, 3).map((i) => i.currentSrc.slice(0, 90)),
    };
  });
  log(`\n=== home page weight after the lazy pass (phone) ===`);
  log(`  ${(total / 1024 / 1024).toFixed(2)} MB total, images ${img.length} files / ${(img.reduce((n, r) => n + r.size, 0) / 1024 / 1024).toFixed(2)} MB (was 2.20 MB / 13 files / 1.13 MB)`);
  log(`  <img> in the DOM: ${counted.inDom} | lazy: ${counted.lazy} | through the proxy: ${counted.proxied} | FAILED TO LOAD: ${counted.broken}`);
  for (const b of counted.brokenSrc) log(`    broken: ${b}`);
  log(`  ten largest downloads:`);
  for (const r of res.slice().sort((a, b) => b.size - a.size).slice(0, 10)) {
    log(`    ${String(Math.round(r.size / 1024)).padStart(5)} KB  ${(r.type || "?").padEnd(14)} ${(r.url ?? "").slice(0, 76)}`);
  }
  const rsc = res.filter((r) => (r.url ?? "").includes("_rsc="));
  log(`  RSC prefetches: ${rsc.length} requests, ${Math.round(rsc.reduce((n, r) => n + r.size, 0) / 1024)} KB (was 2 requests, 210 KB)`);
}

// Are the long pages shorter now?
{
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p3 = await ctx2.newPage();
  log(`\n=== page height on a phone ===`);
  for (const [name, path, before] of [["league PL", "/league/PL", 13119], ["category football", "/category/football", null], ["search", "/search?q=%D5%86%D5%B8%D5%A1", 12247]]) {
    await p3.goto(BASE + path, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await p3.waitForTimeout(1500);
    const m = await p3.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      cards: document.querySelectorAll(".modern-news-card").length,
      shown: [...document.querySelectorAll(".modern-news-card")].filter((c) => c.getBoundingClientRect().height > 0).length,
      button: document.querySelector(".reveal-more")?.textContent?.trim() ?? "none",
      overflow: document.documentElement.scrollWidth > 391,
    }));
    log(`  ${name}: ${m.height}px${before ? ` (was ${before}px)` : ""} | cards in HTML ${m.cards}, displayed ${m.shown} | button: ${m.button}${m.overflow ? " | HORIZONTAL OVERFLOW" : ""}`);
  }
  await ctx2.close();
}

await browser.close();
fs.writeFileSync("add-source-result.txt", report.join("\n"));
