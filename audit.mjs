// Before touching images, find out what the weight actually consists of.
// /search, /category/football and /league/PL each transfer over 3MB, but
// "too heavy" has two different cures: many images that should be deferred,
// or a few enormous ones that should be resized. Guessing between them is
// how the wrong fix gets shipped, so list the resources by size.
//
// Also confirms the player page now renders its statistics table.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://aifootball.am";
const OUT = "audit";
fs.mkdirSync(OUT, { recursive: true });

const report = [];
const log = (s) => { console.log(s); report.push(s); };

const browser = await chromium.launch();

for (const [name, path] of [["category-football", "/category/football"], ["home", "/"]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await ctx.newPage();
  const res = [];
  page.on("response", async (r) => {
    const type = (r.headers()["content-type"] ?? "").split(";")[0];
    let size = Number(r.headers()["content-length"] ?? 0);
    if (!size) { try { size = (await r.body()).length; } catch { size = 0; } }
    if (size > 0) res.push({ size, type, url: r.url() });
  });

  await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(3000);

  const total = res.reduce((n, r) => n + r.size, 0);
  const images = res.filter((r) => r.type.startsWith("image/"));
  const imgTotal = images.reduce((n, r) => n + r.size, 0);

  log(`\n=== ${name} (phone) — ${(total / 1024 / 1024).toFixed(2)} MB in ${res.length} requests ===`);
  log(`  images: ${images.length} files, ${(imgTotal / 1024 / 1024).toFixed(2)} MB (${Math.round((imgTotal / total) * 100)}% of the page)`);
  log(`  everything else: ${((total - imgTotal) / 1024).toFixed(0)} KB`);

  const counted = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")];
    return {
      inDom: imgs.length,
      lazy: imgs.filter((i) => i.getAttribute("loading") === "lazy").length,
      sized: imgs.filter((i) => i.getAttribute("width") && i.getAttribute("height")).length,
      oversized: imgs.filter((i) => i.naturalWidth > i.clientWidth * 2 && i.clientWidth > 0).length,
      worst: imgs
        .filter((i) => i.clientWidth > 0)
        .map((i) => ({ nat: i.naturalWidth, shown: Math.round(i.clientWidth), src: i.currentSrc.slice(0, 80) }))
        .sort((a, b) => b.nat / Math.max(b.shown, 1) - a.nat / Math.max(a.shown, 1))
        .slice(0, 5),
    };
  });
  log(`  <img> in the DOM: ${counted.inDom} | lazy: ${counted.lazy} | with width+height: ${counted.sized}`);
  log(`  loaded at more than twice the size they are displayed: ${counted.oversized}`);
  for (const w of counted.worst) log(`    ${w.nat}px wide, shown at ${w.shown}px  ${w.src}`);

  log(`  ten largest downloads:`);
  for (const r of res.sort((a, b) => b.size - a.size).slice(0, 10)) {
    log(`    ${String(Math.round(r.size / 1024)).padStart(5)} KB  ${r.type.padEnd(12)} ${r.url.slice(0, 88)}`);
  }
  await ctx.close();
}

// Does the player page carry its statistics table now?
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/player/1485", { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(2000);
  const m = await page.evaluate(() => ({
    text: (document.body.innerText ?? "").trim().length,
    tables: document.querySelectorAll(".standings-table").length,
    rows: document.querySelectorAll(".standings-table tbody tr").length,
    heads: [...document.querySelectorAll("h2")].map((h) => h.textContent?.trim()).slice(0, 4),
  }));
  log(`\n=== /player/1485 ===`);
  log(`  text ${m.text} chars (was 891) | stat tables ${m.tables} | rows ${m.rows}`);
  log(`  sections: ${m.heads.join(" / ")}`);
  await page.screenshot({ path: `${OUT}/player-after.jpg`, type: "jpeg", quality: 70 });
  await ctx.close();
}

await browser.close();
fs.writeFileSync("add-source-result.txt", report.join("\n"));
