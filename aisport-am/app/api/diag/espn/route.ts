// Does ESPN answer a Cloudflare Worker?
//
// Everything measured about ESPN so far was measured from a GitHub runner,
// and the one thing that decides whether the match centre can move is
// whether ESPN answers from where the site actually runs. Workers leave
// from Cloudflare's addresses, which are not the runner's, and ESPN sits
// behind Akamai - which refused the runner outright until the request
// stopped calling itself a robot.
//
// So this asks from inside the Worker, with the browser signature that
// worked, and reports exactly what comes back. Gated on CRON_TOKEN like
// every other operational endpoint here, and meant to be deleted once the
// answer is known.
export const dynamic = "force-dynamic";

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

async function probe(label: string, url: string, headers: Record<string, string>) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* an Akamai denial is HTML */ }
    const events = (parsed as { events?: unknown[] } | null)?.events;
    return {
      label,
      status: res.status,
      ms: Date.now() - started,
      events: Array.isArray(events) ? events.length : null,
      body: parsed ? null : text.slice(0, 120),
    };
  } catch (err) {
    return { label, status: 0, ms: Date.now() - started, events: null, body: String(err).slice(0, 120) };
  }
}

export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const token = new URL(request.url).searchParams.get("token");
  if (!runtime.CRON_TOKEN || token !== runtime.CRON_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // MEASURED, not assumed: from inside this Worker, site.api.espn.com
  // answers 403 to every signature - browser, bot and none alike - while
  // site.web.api.espn.com and cdn.espn.com answer 200 in about a tenth of
  // a second. The block is on Cloudflare's addresses at one hostname, not
  // on the request. So the working host is what gets exercised here.
  const scoreboard = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard";
  const WEB = "https://site.web.api.espn.com";
  const results = await Promise.all([
    probe("browser UA", scoreboard, { "User-Agent": BROWSER_UA }),
    probe("bot UA", scoreboard, { "User-Agent": "AIFootballBot/1.0 (+https://aifootball.am)" }),
    probe("no UA", scoreboard, {}),
    probe("browser UA + headers", scoreboard, {
      "User-Agent": BROWSER_UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.espn.com/",
    }),
    probe("cdn.espn.com", "https://cdn.espn.com/core/soccer/scoreboard?xhr=1&league=eng.1", { "User-Agent": BROWSER_UA }),
    probe("site.web.api", "https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard", { "User-Agent": BROWSER_UA }),
    probe("standings", "https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings", { "User-Agent": BROWSER_UA }),
    probe("thesportsdb armenia", "https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=4619&s=2026-2027", { "User-Agent": BROWSER_UA }),
    // Does the host that works serve the rest of the match centre, or only
    // the scoreboard? Nothing moves until these answer too.
    probe("web: standings", `${WEB}/apis/v2/sports/soccer/eng.1/standings`, { "User-Agent": BROWSER_UA }),
    probe("web: summary", `${WEB}/apis/site/v2/sports/soccer/eng.1/summary?event=401879286`, { "User-Agent": BROWSER_UA }),
    probe("web: la liga", `${WEB}/apis/site/v2/sports/soccer/esp.1/scoreboard`, { "User-Agent": BROWSER_UA }),
    probe("web: europa league", `${WEB}/apis/site/v2/sports/soccer/uefa.europa/scoreboard`, { "User-Agent": BROWSER_UA }),
    probe("cdn: scoreboard json", "https://cdn.espn.com/core/soccer/scoreboard?xhr=1&league=esp.1", { "User-Agent": BROWSER_UA }),
  ]);

  // Searching ESPN's league names for "Armenia" was the wrong question -
  // the league is sponsored, and a listing may file it under Fastex or
  // under its Armenian name. The right question is whether ESPN knows the
  // clubs. If Pyunik and Noah are in its database then the league is there
  // under some name; if they are not, it genuinely does not cover Armenia.
  const clubs = await Promise.all(
    ["Pyunik", "Noah Yerevan", "Ararat-Armenia", "Alashkert", "Urartu Yerevan"].map(async (name) => {
      try {
        const res = await fetch(
          `${WEB}/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=5&sport=soccer`,
          { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(15_000) },
        );
        if (!res.ok) return { name, status: res.status, found: null };
        // The results are the items themselves. Reading them as
        // items[].contents[] - ESPN's shape for the American sports, the
        // same wrong assumption that hid the player statistics - returned
        // "nothing" for clubs whose entries Tigran had open in a browser.
        const data = await res.json() as { items?: { id?: string; displayName?: string; type?: string; defaultLeagueSlug?: string }[] };
        const hits = (data.items ?? []).filter((i) => i.type === "team").slice(0, 3);
        return { name, status: res.status, found: hits.map((h) => `${h.displayName} id=${h.id} league=${h.defaultLeagueSlug ?? "?"}`) };
      } catch (err) {
        return { name, status: 0, found: [String(err).slice(0, 60)] };
      }
    }),
  );

  return Response.json({
    from: "cloudflare worker",
    armenianClubsInEspn: clubs,
    colo: request.headers.get("cf-ray")?.split("-")[1] ?? null,
    // The first version of this line read one host and announced "ESPN
    // refuses the Worker" while two others were answering 200 in the same
    // response. A verdict drawn from part of its own evidence is worse
    // than no verdict.
    verdict: results.some((r) => r.status === 200 && r.label.startsWith("web:"))
      ? "ESPN answers the Worker on site.web.api"
      : results.some((r) => r.status === 200)
        ? "ESPN answers the Worker on some hosts - see the list"
        : "ESPN refuses the Worker everywhere",
    results,
  });
}
