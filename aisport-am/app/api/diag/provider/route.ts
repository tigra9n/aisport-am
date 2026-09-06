// Does API-Football answer this Worker?
//
// MEASURED on 6 September, from a GitHub runner: /players/profiles?player=497488
// answers 200 with Bilal Fofana and a photograph. MEASURED the same minute,
// from the deployed site: /player/497488 shows "Այս էջը չկա". The provider
// answers and the page does not, and those two facts cannot both be about
// the same request.
//
// A Worker leaves from Cloudflare's addresses, which are not a runner's,
// and this codebase has already met one provider that treats them
// differently: site.api.espn.com answers 403 to a Worker at every
// signature while site.web.api.espn.com answers 200. If api-sports does
// the same, it is not one player page that is broken - it is the Armenian
// squads, the Armenian live minute, every player page and the whole
// question of what happens on 23 September.
//
// So this asks the exact three calls the player page makes, in order, from
// inside the Worker, and says what came back. Gated on CRON_TOKEN like
// every other operational endpoint here, and meant to be deleted once the
// answer is known.
export const dynamic = "force-dynamic";

const HOST = "https://v3.football.api-sports.io";

async function probe(label: string, url: string, key: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { "x-apisports-key": key, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let parsed: { results?: number; errors?: unknown } | null = null;
    try { parsed = JSON.parse(text) as { results?: number; errors?: unknown }; } catch { /* a denial is HTML */ }
    return {
      label,
      status: res.status,
      ms: Date.now() - started,
      results: parsed?.results ?? null,
      // The errors object is where this provider says "your plan does not
      // include this" and where a refused key says so too.
      errors: parsed?.errors && Object.keys(parsed.errors as object).length ? parsed.errors : null,
      body: parsed ? null : text.slice(0, 200),
    };
  } catch (err) {
    return { label, status: 0, ms: Date.now() - started, results: null, errors: null, body: String(err).slice(0, 200) };
  }
}

export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const token = new URL(request.url).searchParams.get("token");
  if (!runtime.CRON_TOKEN || token !== runtime.CRON_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = runtime.API_FOOTBALL_KEY;
  // Whether the secret is on the Worker at all is the first thing to rule
  // out, and it can be answered without printing it: a missing key and a
  // refused key look identical from the outside otherwise.
  if (!key) return Response.json({ key: "absent from this Worker", probes: [] });

  const player = new URL(request.url).searchParams.get("player") ?? "497488";
  const now = new Date();
  const season = now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  const probes = await Promise.all([
    probe("status", `${HOST}/status`, key),
    probe(`players?id=${player}&season=${season}`, `${HOST}/players?id=${player}&season=${season}`, key),
    probe(`players?id=${player}&season=${season - 1}`, `${HOST}/players?id=${player}&season=${season - 1}`, key),
    probe(`players/profiles?player=${player}`, `${HOST}/players/profiles?player=${player}`, key),
    // The Armenian league, because it is what actually depends on this
    // provider: its clubs, and one club's squad.
    probe(`teams?league=342&season=${season}`, `${HOST}/teams?league=342&season=${season}`, key),
    probe("players/squads?team=709", `${HOST}/players/squads?team=709`, key),
  ]);

  // And the site's own functions, on the same request, because the raw
  // call answering is still not the page rendering: /players/profiles
  // returns Bilal Fofana to this Worker in 184ms and /player/497488 shows
  // "Այս էջը չկա" in the same minute. Whatever is between those two is
  // in here, not in the network.
  const library = await (async () => {
    try {
      const [{ getPlayerProfile, getPlayerTransfers }, { knownPlayer }] = await Promise.all([
        import("../../../../lib/player-server"),
        import("../../../../lib/entity-cache"),
      ]);
      const id = Number(player);
      const [profile, transfers, known] = await Promise.all([
        getPlayerProfile(id).catch((err) => ({ threw: String(err).slice(0, 200) })),
        getPlayerTransfers(id).catch((err) => ({ threw: String(err).slice(0, 200) })),
        knownPlayer(id).catch((err) => ({ threw: String(err).slice(0, 200) })),
      ]);
      return {
        getPlayerProfile: profile && "name" in profile ? { name: profile.name, statistics: profile.statistics.length } : profile,
        getPlayerTransfers: Array.isArray(transfers) ? transfers.length : transfers,
        knownPlayer: known && "name" in known ? known.name : known,
      };
    } catch (err) {
      return { threw: String(err).slice(0, 300) };
    }
  })();

  return Response.json({ key: `present, ${key.length} characters`, season, probes, library });
}
