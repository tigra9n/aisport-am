// Visual and functional audit of aifootball.am, run from a GitHub runner
// because the site is not reachable from the agent's own network.
//
// For each page type it records the HTTP status, load timing, page weight,
// console and network errors, and how much text actually rendered, then
// screenshots it at a desktop and a phone width. The screenshots are what
// turn "the code looks fine" into "here is what a visitor sees".
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://aifootball.am";
const OUT = "audit";
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: "desktop", width: 1366, height: 900, isMobile: false },
  { tag: "mobile", width: 390, height: 844, isMobile: true },
];

const report = [];
const log = (s) => { console.log(s); report.push(s); };

const browser = await chromium.launch();

// Start from the fixed routes, then discover a real team, player and league
// link from the standings page, since those pages are keyed by API-Football
// ids that are not stored locally and cannot be guessed.
let pages = [
  ["home", "/"],
  ["live", "/live"],
  ["standings", "/standings"],
  ["topscorers", "/topscorers"],
  ["armenia", "/armenia"],
  ["opinions", "/opinions"],
  ["podcasts", "/podcasts"],
  ["search", "/search"],
  ["category-football", "/category/football"],
];

{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + "/", { waitUntil: "networkidle", timeout: 45000 });
    const newest = await p.$eval('a[href^="/news/"]', (a) => a.getAttribute("href")).catch(() => null);
    if (newest) pages.push(["article", newest]);
  } catch {}
  try {
    await p.goto(BASE + "/standings", { waitUntil: "networkidle", timeout: 45000 });
    for (const [name, sel] of [["team", 'a[href^="/team/"]'], ["league", 'a[href^="/league/"]']]) {
      const href = await p.$eval(sel, (a) => a.getAttribute("href")).catch(() => null);
      if (href) pages.push([name, href]);
    }
  } catch {}
  try {
    await p.goto(BASE + "/topscorers", { waitUntil: "networkidle", timeout: 45000 });
    const href = await p.$eval('a[href^="/player/"]', (a) => a.getAttribute("href")).catch(() => null);
    if (href) pages.push(["player", href]);
  } catch {}
  await ctx.close();
}

log(`auditing ${pages.length} pages x ${VIEWPORTS.length} widths\n`);

for (const [name, path] of pages) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      deviceScaleFactor: 1,
      userAgent: vp.isMobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    let bytes = 0;
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 160)));
    page.on("requestfailed", (r) => failedRequests.push(`${r.failure()?.errorText ?? "failed"} ${r.url().slice(0, 110)}`));
    page.on("response", async (r) => {
      const len = Number(r.headers()["content-length"] ?? 0);
      if (len) bytes += len;
      if (r.status() >= 400) failedRequests.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`);
    });

    const t0 = Date.now();
    let status = "ERR", ms = 0, title = "", textLen = 0, scrollW = 0, docH = 0;
    try {
      const resp = await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 });
      status = resp ? resp.status() : "no-response";
      ms = Date.now() - t0;
      await page.waitForTimeout(1500); // let client-side content settle
      title = (await page.title()).slice(0, 70);
      const m = await page.evaluate(() => ({
        text: (document.body?.innerText ?? "").trim().length,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        docH: document.documentElement.scrollHeight,
      }));
      textLen = m.text; docH = m.docH;
      scrollW = m.scrollW > m.clientW + 2 ? m.scrollW - m.clientW : 0;
      await page.screenshot({ path: `${OUT}/${name}-${vp.tag}.jpg`, type: "jpeg", quality: 65 });
    } catch (e) {
      consoleErrors.push("navigation: " + String(e).slice(0, 160));
    }

    const flags = [];
    if (status !== 200) flags.push(`STATUS ${status}`);
    if (textLen < 400) flags.push(`ONLY ${textLen} CHARS OF TEXT`);
    if (scrollW > 0) flags.push(`HORIZONTAL OVERFLOW ${scrollW}px`);
    if (ms > 4000) flags.push(`SLOW ${ms}ms`);
    if (consoleErrors.length) flags.push(`${consoleErrors.length} CONSOLE ERROR(S)`);
    if (failedRequests.length) flags.push(`${failedRequests.length} FAILED REQUEST(S)`);

    log(`${flags.length ? "!! " : "OK "}${name} [${vp.tag}] ${path}`);
    log(`     status ${status} | ${ms}ms | text ${textLen} | page height ${docH}px | ~${Math.round(bytes / 1024)}KB`);
    log(`     title: ${title}`);
    if (flags.length) log(`     FLAGS: ${flags.join(" | ")}`);
    for (const e of consoleErrors.slice(0, 4)) log(`       console: ${e}`);
    for (const f of failedRequests.slice(0, 4)) log(`       request: ${f}`);
    log("");

    await ctx.close();
  }
}

await browser.close();
fs.writeFileSync("add-source-result.txt", report.join("\n"));
console.log("audit complete");
