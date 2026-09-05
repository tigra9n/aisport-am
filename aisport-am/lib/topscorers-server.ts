import { armenianPlayerName } from "./player-names-hy";
import { armenianTeamName } from "./team-names-hy";

export type TopScorer = { rank: number; id: number; name: string; team: string; teamId: number | null; teamLogo: string | null; photo: string | null; goals: number; assists: number; appearances: number };

const LEAGUE_ID_BY_CODE: Record<string, number> = {
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

export async function getTopScorers(code: string): Promise<{ rows: TopScorer[]; unavailable: boolean }> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  const leagueId = LEAGUE_ID_BY_CODE[code];
  // The cache key is the paid provider's league number because that is what
  // it has always been; ESPN fills the same row. A code neither provider
  // knows has no page to fill.
  if (!leagueId) return { rows: [], unavailable: true };

  const db = (env as unknown as { DB?: D1Database }).DB;
  const season = currentSeasonYear();
  const cacheKey = `apifootball:v6:topscorers:${leagueId}:${season}`;

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
    const rows = await espnTopScorers(code);
    if (rows && rows.length) {
      if (db) {
        await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(rows), Date.now()).run();
      }
      return { rows, unavailable: false };
    }
  } catch { /* the paid provider below is the fallback */ }

  try {
    if (!key) throw new Error("no key");
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
