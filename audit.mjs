// The road to "finished": audit every page type that has never been
// measured, plus the two things that decide how the site looks the moment
// a link is posted to Telegram or Facebook.
//
// Nothing here is a guess about what to improve. It reports what is
// actually there, so the fixing can start from facts.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://aifootball.am";
const OUT = "audit";
fs.mkdirSync(OUT, { recursive: true });
const report = [];
const log = (s) => { console.log(s); report.push(s); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

// Find a real article and a real match to audit, rather than a made-up URL.
const homeHtml = await (await page.request.get(BASE, { timeout: 45000 })).text();
const articlePath = (homeHtml.match(/href="(\/news\/[a-z0-9-]+)"/) ?? [])[1] ?? "/news/none";
const opinionPath = (homeHtml.match(/href="(\/opinions\/[a-z0-9-]+)"/) ?? [])[1] ?? "/opinions";
const matchId = (homeHtml.match(/af-\d{5,}/) ?? [])[0];

// ---------- 1. Sharing cards. This is what a Telegram or Facebook post shows.
log(`=== sharing cards (Open Graph) ===`);
for (const [name, path] of [["home", "/"], ["article", articlePath], ["league", "/league/PL"], ["opinion", opinionPath]]) {
  const res = await page.request.get(BASE + path, { timeout: 45000 }).catch(() => null);
  if (!res || !res.ok()) { log(`  ${name}: HTTP ${res ? res.status() : "unreachable"}`); continue; }
  const html = await res.text();
  const meta = (prop) => (html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`)) ?? [])[1]
    ?? (html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`)) ?? [])[1] ?? null;
  const image = meta("og:image");
  let imageStatus = "none";
  if (image) {
    const r = await page.request.get(image.startsWith("http") ? image : BASE + image, { timeout: 45000 }).catch(() => null);
    const body = r ? await r.body().catch(() => null) : null;
    imageStatus = r ? `${r.status()} ${(r.headers()["content-type"] ?? "?").split(";")[0]} ${body ? Math.round(body.length / 1024) + "KB" : "?"}` : "unreachable";
  }
  log(`  ${name} (${path})`);
  log(`    og:title       ${meta("og:title") ?? "MISSING"}`);
  log(`    og:description ${(meta("og:description") ?? "MISSING").slice(0, 60)}`);
  log(`    og:image       ${image ? image.slice(0, 70) : "MISSING"} -> ${imageStatus}`);
  log(`    twitter:card   ${meta("twitter:card") ?? "MISSING"}`);
}

// ---------- 2. Pages never measured, at phone width.
log(`\n=== pages never audited (phone) ===`);
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const p = await phone.newPage();
for (const [name, path] of [
  ["article", articlePath], ["standings", "/standings"], ["topscorers", "/topscorers"],
  ["armenia", "/armenia"], ["opinions", "/opinions"], ["opinion", opinionPath],
  ["podcasts", "/podcasts"], ["live", "/live"], ["match", matchId ? `/live/match/${matchId}` : "/live"],
  ["404 page", "/this-page-does-not-exist-12345"],
]) {
  const res = await p.goto(BASE + path, { waitUntil: "load", timeout: 60000 }).catch(() => null);
  if (!res) { log(`  ${name}: unreachable`); continue; }
  await p.waitForTimeout(1200);
  const m = await p.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    text: (document.body.innerText ?? "").trim().length,
    imgs: document.querySelectorAll("img").length,
    noAlt: [...document.querySelectorAll("img")].filter((i) => !i.getAttribute("alt")).length,
    broken: [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).length,
    latin: ((document.body.innerText ?? "").match(/\b[A-Za-z]{4,}\b/g) ?? [])
      .filter((w) => !["FOOTBALL", "Esport", "Live", "Facebook", "Instagram", "Telegram", "Threads", "AIFootball"].includes(w))
      .slice(0, 8),
  }));
  log(`  ${name} (${path}): HTTP ${res.status()} | ${m.height}px | text ${m.text} | img ${m.imgs} (no alt ${m.noAlt}, broken ${m.broken})${m.overflow ? ` | OVERFLOW ${m.overflow}px` : ""}`);
  if (m.latin.length) log(`    latin words: ${m.latin.join(", ")}`);
}

// ---------- 3. Does the site's own search find anything?
log(`\n=== search ===`);
for (const q of ["Ռեալ", "Մխիթարյան", "Բարսելոնա", "լիգա"]) {
  const res = await p.goto(`${BASE}/search?q=${encodeURIComponent(q)}`, { waitUntil: "load", timeout: 60000 }).catch(() => null);
  await p.waitForTimeout(800);
  const found = res ? await p.evaluate(() => document.querySelectorAll(".modern-news-card").length) : -1;
  log(`  "${q}": ${found} results`);
}

// ---------- 4. Does the comment form exist and accept input?
log(`\n=== comments ===`);
await p.goto(BASE + articlePath, { waitUntil: "load", timeout: 60000 }).catch(() => {});
await p.waitForTimeout(1000);
log(`  ${await p.evaluate(() => {
  const form = document.querySelector(".comment-form");
  if (!form) return "no comment form on the article page";
  const fields = [...form.querySelectorAll("input,textarea")].map((f) => f.getAttribute("name") ?? "?");
  const button = form.querySelector("button");
  const existing = document.querySelectorAll(".comment-item").length;
  return `form present | fields: ${fields.join(", ")} | button: ${button ? button.textContent.trim() : "none"} | comments shown: ${existing}`;
})}`);

// ---------- 5. Near-duplicate articles on the home page.
log(`\n=== duplicate coverage on the home page ===`);
await p.goto(BASE, { waitUntil: "load", timeout: 60000 }).catch(() => {});
await p.waitForTimeout(1500);
const titles = await p.evaluate(() =>
  [...document.querySelectorAll("h1, h2, h3, h4")].map((h) => h.textContent?.trim() ?? "").filter((t) => t.length > 25));
const words = (t) => new Set(t.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
let pairs = 0;
for (let i = 0; i < titles.length; i++) {
  for (let j = i + 1; j < titles.length; j++) {
    const a = words(titles[i]); const b = words(titles[j]);
    const shared = [...a].filter((w) => b.has(w)).length;
    const ratio = shared / Math.min(a.size, b.size);
    if (ratio > 0.6 && pairs < 5) { log(`  ${Math.round(ratio * 100)}% shared: "${titles[i].slice(0, 55)}" / "${titles[j].slice(0, 55)}"`); pairs++; }
  }
}
if (!pairs) log(`  no near-duplicate headlines among ${titles.length} on the page`);

await browser.close();
fs.writeFileSync("add-source-result.txt", report.join("\n"));
