// Second pass: the first audit found three pages scrolling sideways on a
// phone - category/football by 599px, league/PL by 494px, search by 48px.
// A screenshot of the top of the page does not show which element is doing
// it, so walk the DOM and name every element wider than the viewport, plus
// the widest text node, which is the usual culprit (an unbroken URL or a
// table that never got a scroll container).
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://aifootball.am";
const OUT = "audit";
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["category-football", "/category/football"],
  ["league", "/league/PL"],
  ["search", "/search"],
  ["home", "/"],
];

const report = [];
const log = (s) => { console.log(s); report.push(s); };

const browser = await chromium.launch();

for (const [name, path] of PAGES) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(2000);

  const found = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const right = r.right + window.scrollX;
      if (right <= vw + 2 && r.width <= vw + 2) continue;
      // Report the element only if no ancestor is already clipping it, since
      // a wide child inside an overflow-x:auto strip is a deliberate design.
      let clipped = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll" || ox === "hidden") { clipped = true; break; }
      }
      if (clipped) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === "string" ? el.className : "").slice(0, 70),
        w: Math.round(r.width),
        right: Math.round(right),
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
      });
    }
    // Keep the outermost offenders: drop any entry that has an ancestor also
    // in the list, so the report names the container, not fifty children.
    return { vw, out: out.slice(0, 25) };
  });

  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log(`\n=== ${name} ${path} — viewport ${found.vw}px, page scrolls ${scroll}px sideways ===`);
  if (!found.out.length) log("  no unclipped element exceeds the viewport");
  for (const e of found.out.slice(0, 12)) {
    log(`  <${e.tag} class="${e.cls}"> width ${e.w}px, right edge at ${e.right}px`);
    if (e.text) log(`      text: ${e.text}`);
  }

  await page.screenshot({ path: `${OUT}/overflow-${name}.jpg`, type: "jpeg", quality: 65, fullPage: false });
  await ctx.close();
}

await browser.close();
fs.writeFileSync("add-source-result.txt", report.join("\n"));
console.log("done");
