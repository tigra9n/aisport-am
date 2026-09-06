import { armenianPlayerName } from "./player-names-hy";
import { armenianTeamName } from "./team-names-hy";

// key and teamKey are ESPN's numbers under an "espn-" prefix; id and teamId
// are API-Football's. A row carries whichever provider filled it, and a link
// prefers the prefixed one - a bare ESPN number in the old slot would open a
// page about a different footballer.
export type TopScorer = { rank: number; id: number; key?: string | null; teamKey?: string | null; name: string; team: string; teamId: number | null; teamLogo: string | null; photo: string | null; goals: number; assists: number; appearances: number };

const LEAGUE_ID_BY_CODE: Record<string, number> = {
  CL: 2,
  EL: 3,
  ECL: 848,
  PL: 39,
  PD: 140,
  SA: 135,
  BL1: 78,
  FL1: 61,
  SPL: 307,
  MLS: 253,
  ARM: 342,
};

type ApiFootballTopScorer = {
  player: { id: number; name: string; photo?: string | null };
  statistics: [{
    team: { id: number; name: string; logo?: string | null };
    goals: { total: number | null; assists: number | null };
    games: { appearences: number | null };
  }];
};

let cacheTableReady: Promise<unknown> | null = null;
async function ensureCacheTable(db: D1Database) {
  cacheTableReady ??= db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
  await cacheTableReady;
}

function currentSeasonYear() {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}


// One cold index at a time.
//
// /topscorers asks for all eight leagues at once. An index costs a club
// list plus twenty rosters, so eight cold ones is a hundred and sixty-eight
// subrequests inside a single render - past what a Worker allows and slow
// enough to time out even where it is allowed. The first league to find its
// index missing builds it; the rest return nothing this time and fill on
// later requests, a league per visit, until every one is warm. A chart that
// appears a minute later is better than a page that does not render.
let buildingIndex: Promise<unknown> | null = null;

// The league's footballers by ESPN id, built from its clubs' rosters and
// kept for a day. Twenty requests, behind a cache, so a chart costs one.
async function leagueAthletes(slug: string, db: D1Database | undefined) {
  const cacheKey = `espn:athletes:${slug}`;
  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 24 * 60 * 60 * 1000) {
      try {
        const parsed = JSON.parse(row.payload) as import("./espn").EspnAthleteIndex;
        if (Object.keys(parsed).length) return parsed;
      } catch { /* rebuild */ }
    }
  }
  if (buildingIndex) return {};
  const { espnLeagueAthletes } = await import("./espn");
  const build = espnLeagueAthletes(slug);
  buildingIndex = build;
  let index: import("./espn").EspnAthleteIndex = {};
  try {
    index = await build;
  } finally {
    buildingIndex = null;
  }
  if (db && Object.keys(index).length) {
    await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(index), Date.now()).run();
  }
  return index;
}

const readNumber = (text: string, pattern: RegExp) => {
  const found = text.match(pattern);
  return found ? Number(found[1]) : 0;
};

async function scorersFromRosters(code: string, db: D1Database | undefined): Promise<TopScorer[] | null> {
  const { ESPN_SLUG_BY_CODE, espnCoreLeaders, espnKey } = await import("./espn");
  const slug = ESPN_SLUG_BY_CODE[code];
  if (!slug) return null;
  const leaders = await espnCoreLeaders(slug);
  if (!leaders?.length) return null;
  const athletes = await leagueAthletes(slug, db);
  const rows: TopScorer[] = [];
  for (const leader of leaders) {
    const athlete = athletes[leader.id];
    // A footballer the rosters do not name has left the league or is on
    // loan from outside it. Skipping is better than a row with no name.
    if (!athlete) continue;
    rows.push({
      rank: rows.length + 1,
      id: Number(leader.id),
      key: espnKey(leader.id),
      teamKey: athlete.teamKey,
      name: armenianPlayerName(athlete.name),
      photo: athlete.photo,
      team: athlete.team,
      teamId: null,
      teamLogo: athlete.teamLogo,
      goals: leader.value || readNumber(leader.long, /Goals:\s*(\d+)/i) || readNumber(leader.short, /\bG:\s*(\d+)/),
      assists: readNumber(leader.short, /\bA:\s*(\d+)/) || readNumber(leader.long, /Assists:\s*(\d+)/i),
      appearances: readNumber(leader.long, /Matches:\s*(\d+)/i) || readNumber(leader.short, /\bM:\s*(\d+)/),
    });
    if (rows.length >= 20) break;
  }
  return rows.length ? rows : null;
}

export async function getTopScorers(code: string): Promise<{ rows: TopScorer[]; unavailable: boolean }> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  const leagueId = LEAGUE_ID_BY_CODE[code];
  // The cache key is the paid provider's league number because that is what
  // it has always been; ESPN fills the same row, and for the European
  // competitions - which ESPN serves and this map now also numbers - the
  // code stands in when there is no number. A code neither provider knows
  // has no page to fill.
  const { ESPN_SLUG_BY_CODE } = await import("./espn");
  if (!leagueId && !ESPN_SLUG_BY_CODE[code]) return { rows: [], unavailable: true };

  const db = (env as unknown as { DB?: D1Database }).DB;
  const season = currentSeasonYear();
  // v7 on 6 September, with the name tables. The chart stores the Armenian
  // spelling rather than the Latin one, so a corrected name waits an hour
  // for the row to expire - and the owner is looking at the page now.
  const cacheKey = `apifootball:v8:topscorers:${leagueId ?? code}:${season}`;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 60 * 60 * 1000) {
      try {
        const rows = JSON.parse(row.payload) as TopScorer[];
        if (rows.length) return { rows, unavailable: false };
      } catch { /* refetch */ }
    }
  }

  // ESPN first, and free. Its leaders endpoint answers in about a tenth of
  // a second and carries fifty names where this page shows twenty, with the
  // goals, the assists, the appearances and a headshot each. API-Football
  // stays underneath because it is what the Armenian league still comes
  // from - ESPN has no Armenian competition - and because on the day this
  // was written the paid provider answered "You have reached the request
  // limit for the day", which is what a hundred requests a day looks like
  // when a page falls back to it on every miss.
  try {
    const { espnTopScorers } = await import("./espn");
    let rows = await espnTopScorers(code);
    // ESPN took the named list away on 6 September - eight addresses, seven
    // of them 404 within the hour, one of them 200 an hour before that. What
    // is left names nobody: fifty entries pointing at athlete documents.
    // The names come from the league's own rosters instead, which are
    // twenty requests once a day rather than fifty on every chart.
    if (!rows?.length) rows = await scorersFromRosters(code, db);
    if (rows && rows.length) {
      if (db) {
        await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(rows), Date.now()).run();
      }
      return { rows, unavailable: false };
    }
  } catch { /* the paid provider below is the fallback */ }

  try {
    if (!key || !leagueId) throw new Error("nothing to ask");
    const response = await fetch(`https://v3.football.api-sports.io/players/topscorers?league=${leagueId}&season=${season}`, {
      headers: { "x-apisports-key": key, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const data = await response.json() as { response?: ApiFootballTopScorer[] };
    const rows: TopScorer[] = (data.response ?? []).slice(0, 20).map((entry, index) => ({
      rank: index + 1,
      id: entry.player.id,
      name: armenianPlayerName(entry.player.name),
      photo: entry.player.photo ?? null,
      team: armenianTeamName(entry.statistics[0].team.name),
      teamId: entry.statistics[0].team.id,
      teamLogo: entry.statistics[0].team.logo ?? null,
      goals: entry.statistics[0].goals.total ?? 0,
      assists: entry.statistics[0].goals.assists ?? 0,
      appearances: entry.statistics[0].games.appearences ?? 0,
    }));
    if (!rows.length) throw new Error("empty");
    if (db) {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(rows), Date.now()).run();
    }
    return { rows, unavailable: false };
  } catch {
    if (db) {
      const stale = await db.prepare("SELECT payload FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string }>();
      if (stale) {
        try {
          const rows = JSON.parse(stale.payload) as TopScorer[];
          if (rows.length) return { rows, unavailable: false };
        } catch { /* fall through */ }
      }
    }
    return { rows: [], unavailable: true };
  }
}
