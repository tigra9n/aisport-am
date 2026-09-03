// What the heavy pages actually weigh, and whether anything still spills
// past the edge of a 360px phone.
//
// Two questions the site cannot answer from the code alone. Page weight is
// the sum of every response the browser really fetched, and horizontal
// overflow only exists once real content is laid out at a real width. Both
// are measured here, on the deployed site, at a phone's viewport.

import { chromium } from "playwright";

const BASE = process.env.WEIGH_BASE_URL ?? "https://aifootball.am";
const PAGES = [
  ["home", "/"],
  ["search", "/search?q=%D4%B2%D5%A1%D6%80%D5%BD%D5%A5%D5%AC%D5%B8%D5%B6%D5%A1"],
  ["category/football", "/category/football"],
  ["league/PL", "/league/PL"],
  ["live", "/live"],
  ["standings", "/standings"],
  ["topscorers", "/topscorers"],
];

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  userAgent:
    "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
});

for (const [name, path] of PAGES) {
  const page = await context.newPage();
  const byType = new Map();
  let total = 0;

  page.on("response", async (response) => {
    const type = response.request().resourceType();
    // content-length is free and present on nearly every response; only
    // fall back to reading the body when it is missing, and never let a
    // failed read stop the measurement.
    let size = Number(response.headers()["content-length"] ?? NaN);
    if (!Number.isFinite(size)) {
      try {
        size = (await response.body()).length;
      } catch {
        size = 0;
      }
    }
    total += size;
    byType.set(type, (byType.get(type) ?? 0) + size);
  });

  const url = `${BASE}${path}`;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    // Lazy images below the fold are part of the real weight for a reader
    // who scrolls, so scroll the page once and let them arrive.
    await page.evaluate(async () => {
      const step = window.innerHeight;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);
  } catch (error) {
    console.log(`  ${name}: could not load - ${String(error).split("\n")[0]}`);
    await page.close();
    continue;
  }

  const layout = await page.evaluate(() => {
    const width = window.innerWidth;
    const spills = [];
    for (const element of document.querySelectorAll("*")) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // Only the element itself, not every ancestor that contains it: an
      // element whose parent already spills is the same finding twice.
      if (box.right > width + 2) {
        const parent = element.parentElement;
        const parentSpills = parent ? parent.getBoundingClientRect().right > width + 2 : false;
        if (!parentSpills) {
          spills.push({
            tag: element.tagName.toLowerCase(),
            cls: (element.className || "").toString().slice(0, 50),
            right: Math.round(box.right),
          });
        }
      }
    }
    return {
      height: Math.round(document.documentElement.scrollHeight),
      overflow: Math.max(0, Math.round(document.documentElement.scrollWidth - width)),
      spills: spills.slice(0, 8),
    };
  });

  const parts = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, size]) => `${type} ${kb(size)}`)
    .join(", ");
  console.log(`  ${name.padEnd(18)} ${kb(total).padStart(7)}  height ${String(layout.height).padStart(5)}px  ${parts}`);
  if (layout.overflow) {
    console.log(`    OVERFLOW ${layout.overflow}px past a 360px screen:`);
    for (const spill of layout.spills) {
      console.log(`      <${spill.tag} class="${spill.cls}"> reaches ${spill.right}px`);
    }
  }
  await page.close();
}

await browser.close();
