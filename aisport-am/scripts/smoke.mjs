// Post-deploy smoke test: open one page of every type the site serves and
// fail if any of them is not a real page.
//
// This exists because a crashing /opinions/ page once stayed live unnoticed:
// the bundler does not type-check, the article pages kept working, and
// nothing ever opened an opinion page after a deploy. A type check now runs
// before the deploy; this runs after it, and covers the failures types
// cannot see - a route that throws on real data, a page that 404s because a
// lookup broke, a template that renders empty.
//
// Dynamic routes are discovered from the live HTML rather than hardcoded, so
// the test keeps testing real content as the site's data changes.

const BASE = process.env.SMOKE_BASE_URL ?? "https://aifootball.am";
const failures = [];
const checked = [];

async function get(path) {
  const url = `${BASE}${path}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "aifootball-smoke/1.0", "cache-control": "no-cache" },
      });
      const body = await response.text();
      return { status: response.status, body };
    } catch (error) {
      // A transient network error on the runner is not a broken page - only
      // report it if it survives every attempt.
      if (attempt === 3) return { status: 0, body: String(error) };
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

// A page is "fine" when it answers 200, is not a Cloudflare/Worker error
// page, and actually rendered its own content instead of an empty shell.
async function expectPage(label, path, mustContain) {
  const { status, body } = await get(path);
  const problems = [];
  if (status !== 200) problems.push(`status ${status}`);
  if (/Worker threw exception|Error 1101|error code: 1101/i.test(body)) problems.push("worker exception page");
  if (status === 200 && body.length < 2000) problems.push(`suspiciously small (${body.length} bytes)`);
  for (const needle of mustContain ?? []) {
    if (!body.includes(needle)) problems.push(`missing ${JSON.stringify(needle)}`);
  }
  checked.push(`${problems.length ? "FAIL" : "ok  "}  ${label.padEnd(22)} ${path}`);
  if (problems.length) failures.push(`${label} (${path}): ${problems.join(", ")}`);
  return body;
}

async function expectStatus(label, path, wanted) {
  const { status, body } = await get(path);
  const bad = status !== wanted || /Worker threw exception|Error 1101/i.test(body);
  checked.push(`${bad ? "FAIL" : "ok  "}  ${label.padEnd(22)} ${path} -> ${status}`);
  if (bad) failures.push(`${label} (${path}): expected ${wanted}, got ${status}`);
}

function firstHref(html, pattern) {
  const match = html.match(pattern);
  return match ? match[0] : null;
}

// A deploy needs a moment to become the version Cloudflare serves, so give
// the home page a chance to answer before judging any page broken.
for (let attempt = 1; attempt <= 12; attempt++) {
  const { status } = await get("/");
  if (status === 200) break;
  if (attempt === 12) console.error(`home page still answering ${status} after 60s`);
  else await new Promise((resolve) => setTimeout(resolve, 5000));
}

const home = await expectPage("home", "/", ["</html>"]);

// Every dynamic route gets a real target taken from the live site.
const newsPath = firstHref(home, /\/news\/[a-z0-9-]+/);
const leaguePath = firstHref(home, /\/league\/[A-Za-z0-9-]+/);
const categoryPath = firstHref(home, /\/category\/[a-z0-9-]+/);

const opinionsIndex = await expectPage("opinions index", "/opinions", ["</html>"]);
const opinionPath = firstHref(opinionsIndex, /\/opinions\/[a-z0-9-]+/);

const standings = await expectPage("standings", "/standings", ["</html>"]);
// Both numberings. A club used to be API-Football's bare number; it is now
// ESPN's under an "espn-" prefix, because the two providers number clubs
// differently and a bare number cannot say which is meant. Matching only
// the old shape reported "no link to one was found" for a page full of
// links, and failed two deploys that had shipped fine.
const teamPath = firstHref(standings, /\/team\/(?:espn-)?\d+/);

const topscorers = await expectPage("top scorers", "/topscorers", ["</html>"]);
const playerPath = firstHref(topscorers, /\/player\/(?:espn-)?\d+/);

for (const [label, path] of [
  ["news article", newsPath],
  ["opinion article", opinionPath],
  ["league", leaguePath],
  ["category", categoryPath],
  ["team", teamPath],
  ["player", playerPath],
]) {
  if (path) await expectPage(label, path, ["</html>"]);
  else failures.push(`${label}: no link to one was found on the live site`);
}

await expectPage("about", "/about", ["</html>"]);
await expectPage("contact", "/contact", ["</html>"]);
await expectPage("editorial", "/editorial", ["</html>"]);
await expectPage("armenia", "/armenia", ["</html>"]);
await expectPage("live", "/live", ["</html>"]);
await expectPage("search", "/search?q=%D4%B2%D5%A1%D6%80%D5%BD%D5%A5%D5%AC%D5%B8%D5%B6%D5%A1", ["</html>"]);
await expectPage("podcasts", "/podcasts", ["</html>"]);
await expectPage("privacy", "/privacy", ["</html>"]);
await expectPage("terms", "/terms", ["</html>"]);

// Not pages, but just as fatal when they break.
await expectStatus("sitemap", "/sitemap.xml", 200);
await expectStatus("robots", "/robots.txt", 200);
await expectStatus("news feed api", "/api/articles?limit=1", 200);

// A missing article must answer 404, not 200 and not a worker crash - an
// empty page served as 200 is what poisons the search index.
await expectStatus("missing article", "/news/this-slug-does-not-exist-smoke-test", 404);
await expectStatus("missing opinion", "/opinions/this-slug-does-not-exist-smoke", 404);

// The Google News sitemap is only useful while it is correct: the format
// is strict, and Google drops a feed whose entries are older than two days.
{
  const { status, body } = await get("/news-sitemap.xml");
  const problems = [];
  if (status !== 200) problems.push(`status ${status}`);
  if (!body.includes("http://www.google.com/schemas/sitemap-news/0.9")) problems.push("missing the news namespace");
  const count = (body.match(/<news:news>/g) ?? []).length;
  if (count === 0) problems.push("no articles listed");
  if (count > 1000) problems.push(`${count} articles, over Google's limit of 1000`);
  const dates = [...body.matchAll(/<news:publication_date>([^<]+)</g)].map((m) => Date.parse(m[1]));
  const tooOld = dates.filter((date) => Number.isFinite(date) && Date.now() - date > 3 * 24 * 60 * 60 * 1000);
  if (tooOld.length) problems.push(`${tooOld.length} entries older than the two-day window`);
  checked.push(`${problems.length ? "FAIL" : "ok  "}  ${"news sitemap".padEnd(22)} /news-sitemap.xml -> ${count} articles`);
  if (problems.length) failures.push(`news sitemap: ${problems.join(", ")}`);
}

// The placeholder ad boxes ("Վերին գովազդային տարածք") are switched off by
// ADS_ENABLED in components/ad-spaces.tsx. A reader met them above the
// first headline and the site read as unfinished, so if that flag is ever
// flipped back by accident this should fail rather than ship.
{
  const { body } = await get("/");
  const placeholder = /գովազդային տարածք/i.test(body);
  checked.push(`${placeholder ? "FAIL" : "ok  "}  ${"no ad placeholders".padEnd(22)} /`);
  if (placeholder) failures.push("home (/): the empty ad placeholder boxes are being rendered");
}

console.log(checked.join("\n"));

if (failures.length) {
  console.error(`\n${failures.length} page(s) are broken on ${BASE}:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nAll ${checked.length} checks passed on ${BASE}.`);
