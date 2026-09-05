// Core Web Vitals on the deployed site: LCP, CLS and INP.
//
// Search Console reports these from real visitors, weeks after the fact.
// This measures them now, in a phone-shaped viewport on a throttled CPU, so
// a change can be judged the same day it ships.
//
// LCP  - when the biggest thing above the fold finished painting. Good < 2.5s
// CLS  - how much the layout jumped while loading.          Good < 0.1
// INP  - how long the page took to answer a real click.     Good < 200ms
//
// INP here is a real measurement, not an estimate: the script clicks
// something on the page and reads the event-timing entry that click
// produced.

import { chromium } from "playwright";
import { measureAsAReader } from "./measure-as-a-reader.mjs";

const BASE = process.env.VITALS_BASE_URL ?? "https://aifootball.am";

async function discover(path, pattern) {
  const response = await fetch(`${BASE}${path}`);
  const html = await response.text();
  const match = html.match(pattern);
  return match ? match[0] : null;
}

const articlePath = await discover("/", /\/news\/[a-z0-9-]+/);
const PAGES = [
  ["home", "/"],
  ["article", articlePath],
  ["category", "/category/football"],
].filter(([, path]) => path);

const browser = await chromium.launch();

for (const [name, path] of PAGES) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
  });
  await measureAsAReader(context);
  const page = await context.newPage();

  // A mid-range phone is roughly four times slower than this runner. Without
  // this the numbers describe a desktop and flatter the site.
  const session = await context.newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  // The observers have to be installed before anything paints.
  await page.addInitScript(() => {
    window.__vitals = { lcp: 0, cls: 0, inp: 0, shifts: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__vitals.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // A shift the user caused by tapping is not a layout problem.
        if (entry.hadRecentInput) continue;
        window.__vitals.cls += entry.value;
        if (entry.value > 0.01) {
          const source = entry.sources?.[0]?.node;
          window.__vitals.shifts.push({
            value: Number(entry.value.toFixed(4)),
            node: source ? `${source.tagName?.toLowerCase()}.${(source.className || "").toString().split(" ")[0]}` : "unknown",
          });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__vitals.inp = Math.max(window.__vitals.inp, entry.duration);
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  });

  await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90000 });

  // Scroll the whole page: lazy images arriving late are exactly what makes
  // a layout jump, and CLS is measured over the visit, not the first paint.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);

  // A real interaction for INP: a link the page definitely has, clicked
  // with the navigation suppressed so the page stays put.
  try {
    await page.evaluate(() => {
      document.querySelectorAll("a").forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
    });
    const target = page.locator("a").first();
    await target.click({ timeout: 5000 });
    await page.waitForTimeout(500);
    const button = page.locator("button").first();
    if (await button.count()) {
      await button.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  } catch {
    // No clickable element is a finding in itself, but not a fatal one.
  }

  const vitals = await page.evaluate(() => window.__vitals);
  const verdict = (value, good, poor) => (value <= good ? "good" : value <= poor ? "needs work" : "POOR");

  console.log(`  ${name.padEnd(10)} LCP ${(vitals.lcp / 1000).toFixed(2)}s (${verdict(vitals.lcp, 2500, 4000)})  ` +
    `CLS ${vitals.cls.toFixed(3)} (${verdict(vitals.cls, 0.1, 0.25)})  ` +
    `INP ${Math.round(vitals.inp)}ms (${verdict(vitals.inp, 200, 500)})`);
  for (const shift of vitals.shifts.slice(0, 5)) {
    console.log(`      shift ${shift.value} from <${shift.node}>`);
  }

  await context.close();
}

await browser.close();
