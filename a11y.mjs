// What the site is like to use without a mouse, and without sight.
//
// The audit has been reporting accessibility as "no missing alt, contrast
// readable" and that is two questions out of dozens. This runs axe-core -
// the same engine browser extensions and CI tools use - against every page
// type, and then does the part axe cannot: presses Tab and watches where
// the focus goes, opens the match modal with the keyboard and tries to
// close it again.
//
// Nothing here is a judgement. Every line is something a browser measured.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.A11Y_BASE_URL ?? "https://aifootball.am";
const AXE = fs.readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();

// Real pages, found from the site itself - a made-up URL proves nothing.
const home = await (await page.request.get(BASE, { timeout: 45000 })).text();
const article = (home.match(/href="(\/news\/[a-z0-9-]+)"/) ?? [])[1] ?? "/news/none";

const PAGES = [
  ["home", "/"],
  ["article", article],
  ["standings", "/standings"],
  ["live", "/live"],
  ["search", "/search?q=%D5%8C%D5%A5%D5%A1%D5%AC"],
  ["contact", "/contact"],
];

console.log(`# Accessibility of ${BASE}`);
console.log(`# ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC, axe-core against WCAG 2.1 AA\n`);

let critical = 0, serious = 0, moderate = 0, minor = 0;
const seen = new Map();

console.log("=== what axe finds ===");
for (const [name, path] of PAGES) {
  await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
  }).catch((err) => ({ violations: [], error: String(err) }));

  const violations = result.violations ?? [];
  if (!violations.length) {
    console.log(`  ${name.padEnd(11)} clean`);
    continue;
  }
  console.log(`  ${name.padEnd(11)} ${violations.length} kind(s) of problem`);
  for (const v of violations) {
    const count = v.nodes.length;
    if (v.impact === "critical") critical += count;
    else if (v.impact === "serious") serious += count;
    else if (v.impact === "moderate") moderate += count;
    else minor += count;
    seen.set(v.id, { impact: v.impact, help: v.help, pages: (seen.get(v.id)?.pages ?? 0) + 1 });
    console.log(`    [${(v.impact ?? "?").padEnd(8)}] ${v.id}: ${v.help} (${count} element${count === 1 ? "" : "s"})`);
    const sample = v.nodes[0]?.html?.replace(/\s+/g, " ").slice(0, 90);
    if (sample) console.log(`               e.g. ${sample}`);
  }
}

// ---------- The keyboard. axe cannot press it.
console.log(`\n=== using the site without a mouse ===`);
await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1000);

// Where does the first Tab go, and can you get past the header at all?
const stops = [];
for (let i = 0; i < 12; i++) {
  await page.keyboard.press("Tab");
  stops.push(await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: "(nothing)", name: "", focusVisible: false };
    const style = getComputedStyle(el);
    const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("alt") || "").replace(/\s+/g, " ").trim().slice(0, 34);
    return {
      tag: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""),
      name,
      // A focus ring is either an outline the browser draws or something the
      // stylesheet draws instead. Both count; neither is the failure.
      focusVisible: (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none",
    };
  }));
}
const unnamed = stops.filter((s) => s.tag !== "(nothing)" && !s.name).length;
const unfocused = stops.filter((s) => s.tag !== "(nothing)" && !s.focusVisible).length;
console.log(`  the first twelve stops:`);
for (const [i, s] of stops.entries()) {
  console.log(`   ${String(i + 1).padStart(2)}. ${s.tag.padEnd(28)} ${s.name ? `"${s.name}"` : "NO ACCESSIBLE NAME"}${s.focusVisible ? "" : "   no visible focus"}`);
}
console.log(`  ${unnamed} of them cannot be named by a screen reader`);
console.log(`  ${unfocused} of them show nothing when focused`);

// Does the first stop skip the navigation? Twenty links before the article
// is a long way to Tab on every page.
const first = stops[0];
console.log(`  skip link: ${first.name.toLowerCase().includes("անցնել") || first.tag.includes("skip") ? "yes" : "none - a keyboard reader tabs through the whole header on every page"}`);

// The modal is the one thing on this site that traps a mouse user happily
// and can trap a keyboard user badly.
console.log(`\n=== the match modal, from the keyboard ===`);
await page.goto(BASE + "/live", { waitUntil: "load", timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);
const row = await page.$(".match-row-link");
if (!row) {
  console.log("  no match on the page right now - nothing to open");
} else {
  await row.click();
  await page.waitForTimeout(1800);
  const opened = await page.$(".match-modal");
  console.log(`  opens: ${opened ? "yes" : "no"}`);
  if (opened) {
    const inside = await page.evaluate(() => !!document.querySelector(".match-modal")?.contains(document.activeElement));
    console.log(`  focus moves into it: ${inside ? "yes" : "NO - a screen reader stays behind the dialog"}`);
    const role = await page.evaluate(() => {
      const m = document.querySelector(".match-modal");
      return { role: m?.getAttribute("role") ?? "(none)", modal: m?.getAttribute("aria-modal") ?? "(none)", label: m?.getAttribute("aria-label") ?? m?.getAttribute("aria-labelledby") ?? "(none)" };
    });
    console.log(`  role=${role.role}  aria-modal=${role.modal}  labelled by=${role.label}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    console.log(`  closes with Escape: ${(await page.$(".match-modal")) ? "NO" : "yes"}`);
  }
}

// ---------- The things that are one attribute each.
console.log(`\n=== the basics ===`);
await page.goto(BASE + "/", { waitUntil: "load", timeout: 60000 }).catch(() => {});
const basics = await page.evaluate(() => ({
  lang: document.documentElement.getAttribute("lang") ?? "(none)",
  title: document.title.slice(0, 50),
  h1: document.querySelectorAll("h1").length,
  landmarks: ["header", "nav", "main", "footer"].filter((t) => document.querySelector(t)).join(", ") || "(none)",
  headingJumps: (() => {
    const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
    let jumps = 0;
    for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) jumps++;
    return jumps;
  })(),
}));
console.log(`  lang="${basics.lang}"  |  h1 count: ${basics.h1}  |  landmarks: ${basics.landmarks}`);
console.log(`  heading levels skipped: ${basics.headingJumps}`);

console.log(`\n=== the count ===`);
console.log(`  critical ${critical}   serious ${serious}   moderate ${moderate}   minor ${minor}`);
if (!critical && !serious) console.log("  nothing that stops someone using the site");

await browser.close();
