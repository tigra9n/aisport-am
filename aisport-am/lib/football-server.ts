import { demoStandings, type StandingRow } from "./football";
import { armenianTeamName } from "./team-names-hy";

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

type ApiFootballStandingsResponse = {
  response?: { league?: { standings?: Array<Array<{
    rank: number;
    team: { id: number; name: string; logo?: string | null };
    points: number;
    goalsDiff: number;
    group?: string | null;
    all: { played: number; win: number; draw: number; lose: number };
  }>> } }[];
};

let cacheTableReady: Promise<unknown> | null = null;
async function ensureCacheTable(db: D1Database) {
  cacheTableReady ??= db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
  await cacheTableReady;
}

function currentSeasonYear() {
  // European club seasons run Aug-May; the "season year" is the year it starts in.
  const now = new Date();
  const month = now.getUTCMonth() + 1; // 1-12
  return month >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export async function getStandings(code: string): Promise<{ rows: StandingRow[]; demo: boolean }> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  const leagueId = LEAGUE_ID_BY_CODE[code];
  if (!key || !leagueId) return { rows: demoStandings(code), demo: true };

  const db = (env as unknown as { DB?: D1Database }).DB;
  const season = currentSeasonYear();
  const cacheKey = `apifootball:v3:standings:${leagueId}:${season}`;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 30 * 60 * 1000) {
      try {
        const rows = JSON.parse(row.payload) as StandingRow[];
        if (rows.length) return { rows, demo: false };
      } catch { /* fall through to refetch */ }
    }
  }

  try {
    const response = await fetch(`https://v3.football.api-sports.io/standings?league=${leagueId}&season=${season}`, {
      headers: { "x-apisports-key": key, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const data = await response.json() as ApiFootballStandingsResponse;
    // Most leagues return a single flat table in standings[0]. US-style
    // leagues (MLS confirmed) split into multiple groups instead (Eastern
    // Conference, Western Conference) - taking only standings[0] silently
    // dropped half the league. Flatten every group into one table. Sort
    // Eastern Conference block first, then Western (each internally by
    // points/goal difference), with continuous 1..N ranking - matches how
    // Tigran wants it displayed (one full conference finishes, then the
    // next begins) rather than interleaving both by points.
    const groups = data.response?.[0]?.league?.standings ?? [];
    const table = groups.flat();
    if (!table.length) throw new Error("empty table");
    const groupPriority = (group?: string | null) => {
      if (!group) return 0;
      if (group.includes("Eastern")) return 0;
      if (group.includes("Western")) return 1;
      return 0;
    };
    const sorted = [...table].sort((a, b) =>
      groupPriority(a.group) - groupPriority(b.group)
      || b.points - a.points
      || b.goalsDiff - a.goalsDiff);
    const rows: StandingRow[] = sorted.map((row, index) => ({
      position: index + 1,
      team: armenianTeamName(row.team.name),
      teamId: row.team.id,
      teamLogo: row.team.logo ?? null,
      played: row.all.played,
      won: row.all.win,
      draw: row.all.draw,
      lost: row.all.lose,
      goalDifference: row.goalsDiff,
      points: row.points,
    }));
    if (db) {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(rows), Date.now()).run();
    }
    return { rows, demo: false };
  } catch {
    if (db) {
      const stale = await db.prepare("SELECT payload FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string }>();
      if (stale) {
        try {
          const rows = JSON.parse(stale.payload) as StandingRow[];
          if (rows.length) return { rows, demo: false };
        } catch { /* fall through to demo */ }
      }
    }
    return { rows: demoStandings(code), demo: true };
  }
}
