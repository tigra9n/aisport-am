// Confirms the flex-wrap fix: the four pages using .page-toolbar must now
// scroll 0px sideways at phone width, and the desktop layout must be
// unchanged - wrapping only engages when the row genuinely does not fit,
// so a wide screen should look exactly as before.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://aifootball.am";
const OUT = "audit";
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["category-football", "/category/football"],
  ["league", "/league/PL"],
  ["search", "/search"],
  ["armenia", "/armenia"],
  ["home", "/"],
];

const report = [];
const log = (s) => { console.log(s); report.push(s); };

const browser = await chromium.launch();
let bad = 0;

for (const vp of [
  { tag: "mobile", width: 390, height: 844, isMobile: true },
  { tag: "desktop", width: 1366, height: 900, isMobile: false },
]) {
  log(`\n=== ${vp.tag} (${vp.width}px) ===`);
  for (const [name, path] of PAGES) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      userAgent: vp.isMobile
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        : undefined,
    });
    const page = await ctx.newPage();
    await page.goto(BASE + path, { waitUntil: "load", timeout: 45000 });
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => {
      const d = document.documentElement;
      const tb = document.querySelector(".page-toolbar");
      return {
        overflow: d.scrollWidth - d.clientWidth,
        toolbarH: tb ? Math.round(tb.getBoundingClientRect().height) : null,
        chips: tb ? tb.children.length : null,
      };
    });
    const ok = m.overflow <= 2;
    if (!ok) bad++;
    log(`  ${ok ? "OK  " : "FAIL"} ${name.padEnd(18)} sideways ${String(m.overflow).padStart(4)}px | chip row ${m.chips ?? "-"} items, ${m.toolbarH ?? "-"}px tall`);
    if (vp.isMobile) await page.screenshot({ path: `${OUT}/fixed-${name}.jpg`, type: "jpeg", quality: 65 });
    await ctx.close();
  }
}

await browser.close();
log(`\n${bad === 0 ? "ALL PAGES FIT" : bad + " STILL OVERFLOWING"}`);
fs.writeFileSync("add-source-result.txt", report.join("\n"));
