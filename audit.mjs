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
for (const [name, path] of [["home", `/?cachebust=${Date.now()}`], ["article", articlePath], ["league", "/league/PL"], ["opinion", opinionPath]]) {
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
    // An image with no alt attribute at all is the fault. An image with
    // alt="" is not: that is how you mark one decorative, and every badge
    // and player photograph on this site sits directly beside the name it
    // belongs to, so an empty alt is exactly right - a screen reader says
    // "Arsenal" once instead of "Arsenal badge Arsenal" forty times in one
    // table. This check counted both, because "" is falsy, and reported
    // ninety-six faults on pages that have none. Counted apart now, so the
    // number that means something is the first one.
    noAlt: [...document.querySelectorAll("img")].filter((i) => i.getAttribute("alt") === null).length,
    decorative: [...document.querySelectorAll("img")].filter((i) => i.getAttribute("alt") === "").length,
    broken: [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).length,
    latin: ((document.body.innerText ?? "").match(/\b[A-Za-z]{4,}\b/g) ?? [])
      .filter((w) => !["FOOTBALL", "Esport", "Live", "Facebook", "Instagram", "Telegram", "Threads", "AIFootball"].includes(w))
      .slice(0, 8),
  }));
  log(`  ${name} (${path}): HTTP ${res.status()} | ${m.height}px | text ${m.text} | img ${m.imgs} (missing alt ${m.noAlt}, decorative ${m.decorative}, broken ${m.broken})${m.overflow ? ` | OVERFLOW ${m.overflow}px` : ""}`);
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
// Only within the by-sport grid. The hero carousel repeating the top story
// in the headline strip is the design of a news page, not a defect - I
// "fixed" that once and pushed the live feed two hours into the past.
const titles = await p.evaluate(() =>
  [...document.querySelectorAll(".sport-news-grid h4, .sport-news-grid h3")]
    .map((h) => h.textContent?.trim() ?? "").filter((t) => t.length > 25));
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

// The home page only ever shows a handful. The repeat that actually reached
// readers - two pieces about Manu Koné ninety minutes apart - was never both
// on screen at once, so this asks the API for the whole day instead.
//
// The rule is deliberately the same one lib/story-signature.ts applies
// before publishing: stems of the title and summary together, cut to five
// characters so Armenian case endings collapse, and both a proportion and a
// count have to clear their threshold. Kept in step with that file by hand -
// if one changes, change the other.
log(`\n=== the same story twice, across the last 24 hours ===`);
try {
  const response = await fetch(`${BASE}/api/articles?limit=80`);
  const payload = await response.json();
  const recent = (Array.isArray(payload) ? payload : payload.articles ?? []).map((a) => ({
    title: a.title ?? "",
    excerpt: a.excerpt ?? "",
  }));
  const STOP = new Set(["որպես","համար","մասին","հետո","առաջ","բայց","սակայն","ըստ","հետ","մինչև","կողմից","ակումբը","ակումբի","թիմը","թիմի","մարզիչը","գլխավոր","հրապարակման","աղբյուրների","փոխանցմամբ","տեղեկություններով"]);
  const stems = (a) => {
    const out = new Set();
    for (const w of `${a.title} ${a.excerpt}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (w.length >= 4 && !STOP.has(w)) out.add(w.slice(0, 5));
    }
    return out;
  };
  const signatures = recent.map(stems);
  let repeats = 0;
  for (let i = 0; i < recent.length; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      const a = signatures[i], b = signatures[j];
      if (!a.size || !b.size) continue;
      const shared = [...a].filter((w) => b.has(w)).length;
      const overlap = (2 * shared) / (a.size + b.size);
      if (overlap >= 0.42 && shared >= 6 && repeats < 6) {
        log(`  ${overlap.toFixed(2)} / ${shared} stems: "${recent[i].title.slice(0, 52)}" / "${recent[j].title.slice(0, 52)}"`);
        repeats++;
      }
    }
  }
  if (!repeats) log(`  no repeated stories among the last ${recent.length} published`);
} catch (error) {
  log(`  could not check: ${String(error).slice(0, 120)}`);
}

// ---------- 6. Light mode. The league picker was invisible there - a
// hard-coded dark background under theme-coloured text - and nothing had
// ever checked the light theme at all. Walk the visible text and report
// anything whose contrast against its own background is too low to read.
log(`\n=== light mode contrast ===`);
{
  const html = await (await page.request.get(BASE + "/", { timeout: 45000 })).text();
  const href = (html.match(/href="(\/assets\/index-[^"]+\.css)"/) ?? [])[1];
  if (href) {
    const css = await (await page.request.get(BASE + href, { timeout: 45000 })).text();
    log(`  stylesheet ${href}: light-theme green present: ${css.includes("#0e6c3e") ? "yes" : "NO - the deploy did not carry it"}`);
  }
}
for (const [theme, name, path] of [
  ["dark", "home", "/"], ["dark", "article", articlePath], ["dark", "live", "/live"], ["dark", "search", "/search?q=%D5%84%D5%A5%D5%BD%D5%BD%D5%AB"],
  ["light", "home", "/"], ["light", "standings", "/standings"], ["light", "article", articlePath], ["light", "live", "/live"],
]) {
  await p.goto(BASE + path, { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await p.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch { /* ignore */ }
  }, theme);
  await p.waitForTimeout(900);
  const bad = await p.evaluate(() => {
    const parse = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const backdrop = (el) => {
      for (let node = el; node; node = node.parentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        const parts = parse(bg);
        if (parts.length >= 3 && (parts[3] === undefined || parts[3] > 0.5)) return parts;
      }
      return [255, 255, 255];
    };
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const text = (el.textContent ?? "").trim();
      if (!text || el.children.length > 0) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") continue;
      const fg = parse(style.color);
      if (fg.length < 3) continue;
      const l1 = lum(fg) + 0.05;
      const l2 = lum(backdrop(el)) + 0.05;
      const ratio = l1 > l2 ? l1 / l2 : l2 / l1;
      if (ratio < 3) out.push(`${ratio.toFixed(1)}:1  <${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}> "${text.slice(0, 26)}"  color ${style.color} on ${backdrop(el).join(",")}`);
    }
    // The select is not caught by the walk above: its text is drawn by the
    // browser, not by a child node.
    for (const el of document.querySelectorAll("select")) {
      const style = getComputedStyle(el);
      const fg = parse(style.color); const bg = parse(style.backgroundColor);
      if (fg.length < 3 || bg.length < 3) continue;
      const l1 = lum(fg) + 0.05; const l2 = lum(bg) + 0.05;
      const ratio = l1 > l2 ? l1 / l2 : l2 / l1;
      if (ratio < 3) out.push(`${ratio.toFixed(1)}:1  <select.${String(el.className).split(" ")[0]}>`);
    }
    return [...new Set(out)];
  });
  log(`  ${theme} / ${name}: ${bad.length ? `${bad.length} unreadable` : "everything readable"}`);
  for (const b of bad.slice(0, 6)) log(`    ${b}`);
}

// ---------- 7. How many player names actually come out in Armenian? The
// table holds about ninety, everything else is left as the API sent it, so
// the honest number is the share of the names a reader actually meets.
log(`\n=== player names in Armenian ===`);
// Wrapped: this section printed its heading and nothing else on the last
// run, which told me it had failed but not where. A silent check is worse
// than no check - it reads as "nothing to report".
try {
  const isArmenian = (t) => /[\u0530-\u058F]/.test(t);
  for (const [name, path, selector] of [
    ["top scorers", "/topscorers", ".topscorers-table tbody tr td:nth-child(2)"],
    ["squad (Man City)", "/team/50", ".squad-card strong"],
    // 3683, not 3838. The old id belongs to no Armenian club, so this
    // check reported an empty squad for weeks and I passed that on as a
    // fault in the site. API-Football lists Ararat-Armenia as 3683.
    ["squad (Ararat-Armenia)", "/team/3683", ".squad-card strong"],
  ]) {
    await p.goto(BASE + path, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const names = await p.evaluate((sel) =>
      [...document.querySelectorAll(sel)].map((n) => n.textContent?.trim() ?? "").filter(Boolean), selector);
    const hy = names.filter(isArmenian);
    log(`  ${name}: ${hy.length} of ${names.length} in Armenian`);
    const latin = names.filter((n) => !isArmenian(n)).slice(0, 6);
    if (latin.length) log(`    still latin: ${latin.join(", ")}`);
  }
  // And the player pages themselves.
  for (const id of [1485, 47323, 276, 874]) {
    await p.goto(`${BASE}/player/${id}`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(900);
    const title = await p.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "?");
    log(`  /player/${id}: ${title}${isArmenian(title) ? "" : "  <- latin"}`);
  }
} catch (err) {
  log(`  this check failed: ${String(err).slice(0, 160)}`);
}

// ---------- 8a. Is the live strip actually showing the newest article?
// This is the check that was missing: every measurement was green while a
// strip labelled "24/7, updating" sat two hours behind the site.
log(`\n=== is the live strip current ===`);
{
  await p.goto(`${BASE}/?cachebust=${Date.now()}`, { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const m = await p.evaluate(() => {
    const times = [...document.querySelectorAll(".headline-feed-item time")].map((t) => t.textContent?.trim() ?? "");
    const firstFeedTitle = document.querySelector(".headline-feed-item h3")?.textContent?.trim() ?? "?";
    const heroTitle = document.querySelector(".main-lead h1")?.textContent?.trim() ?? "?";
    const heroMeta = [...document.querySelectorAll(".lead-overlay div span")].map((x) => x.textContent?.trim() ?? "");
    return { times: times.slice(0, 5), firstFeedTitle: firstFeedTitle.slice(0, 44), heroTitle: heroTitle.slice(0, 44), heroMeta: heroMeta.slice(0, 4) };
  });
  log(`  hero:  "${m.heroTitle}"  [${m.heroMeta.join(" ")}]`);
  log(`  feed:  "${m.firstFeedTitle}"`);
  log(`  first five times in the feed: ${m.times.join(", ")}`);
}

// ---------- 8b. Is the edge serving a stale home page? Articles are being
// published every twenty minutes, but a reader reported seeing nothing new
// for two hours - and an earlier run read an old share image from "/" while
// the same page with a cache-busting parameter gave the new one. Ask for
// both and compare what they say the newest article is.
log(`\n=== is the home page served from cache ===`);
{
  const newest = async (url) => {
    const res = await page.request.get(url, { timeout: 45000 }).catch(() => null);
    if (!res || !res.ok()) return { title: `HTTP ${res ? res.status() : "?"}`, headers: {} };
    const html = await res.text();
    const m = html.match(/<h1[^>]*>(?:<a[^>]*>)?([^<]{12,})/) ?? html.match(/href="\/news\/[a-z0-9-]+"[^>]*>([^<]{12,})/);
    return { title: (m?.[1] ?? "?").trim().slice(0, 46), headers: res.headers() };
  };
  const plain = await newest(BASE + "/");
  const fresh = await newest(`${BASE}/?cachebust=${Date.now()}`);
  log(`  plain  /            newest headline: "${plain.title}"`);
  log(`    cf-cache-status: ${plain.headers["cf-cache-status"] ?? "none"} | age: ${plain.headers["age"] ?? "none"} | cache-control: ${plain.headers["cache-control"] ?? "none"}`);
  log(`  /?cachebust=...     newest headline: "${fresh.title}"`);
  log(`    cf-cache-status: ${fresh.headers["cf-cache-status"] ?? "none"} | age: ${fresh.headers["age"] ?? "none"}`);
  log(`  same content: ${plain.title === fresh.title ? "yes" : "NO - the plain URL is stale"}`);
}

await browser.close();
fs.writeFileSync("add-source-result.txt", report.join("\n"));
