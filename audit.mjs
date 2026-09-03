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
    if (size > 0) res.push({ size, type, url: r.url() });
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
  log(`  ten largest downloads:`);
  for (const r of res.slice().sort((a, b) => b.size - a.size).slice(0, 10)) {
    log(`    ${String(Math.round(r.size / 1024)).padStart(5)} KB  ${(r.type || "?").padEnd(14)} ${(r.url ?? "").slice(0, 76)}`);
  }
  const rsc = res.filter((r) => (r.url ?? "").includes("_rsc="));
  log(`  RSC prefetches: ${rsc.length} requests, ${Math.round(rsc.reduce((n, r) => n + r.size, 0) / 1024)} KB (was 2 requests, 210 KB)`);
}

await browser.close();
fs.writeFileSync("add-source-result.txt", report.join("\n"));
