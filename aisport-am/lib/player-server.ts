import { armenianTeamName } from "./team-names-hy";

export type PlayerSeasonStat = {
  league: string;
  leagueLogo: string | null;
  team: string;
  teamLogo: string | null;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  rating: string | null;
};

export type PlayerProfile = {
  id: number;
  name: string;
  photo: string | null;
  nationality: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  position: string | null;
  currentTeam: string | null;
  currentTeamLogo: string | null;
  shirtNumber: number | null;
  season: number;
  statistics: PlayerSeasonStat[];
};
export type TransferEntry = { date: string; teamOut: string; teamOutLogo: string | null; teamIn: string; teamInLogo: string | null; type: string | null };

// The players endpoint returns the season's statistics alongside the
// biography, broken down per competition. All of it arrives in the same
// response the profile already fetches, so reading it costs no extra API
// call and no extra latency - it was simply being discarded.
// "appearences" is API-Football's own spelling and has to be matched.
type ApiFootballPlayerProfile = {
  player: {
    id: number;
    name: string;
    photo?: string | null;
    nationality?: string | null;
    birth?: { date?: string | null; place?: string | null };
    height?: string | null;
    weight?: string | null;
    age?: number | null;
  };
  statistics?: {
    team?: { name?: string | null; logo?: string | null };
    league?: { name?: string | null; logo?: string | null };
    games?: { appearences?: number | null; minutes?: number | null; position?: string | null; rating?: string | null; number?: number | null };
    goals?: { total?: number | null; assists?: number | null };
    cards?: { yellow?: number | null; red?: number | null };
  }[];
};
type ApiFootballTransfer = {
  transfers: { date: string; type: string | null; teams: { in: { name: string; logo?: string | null }; out: { name: string; logo?: string | null } } }[];
};

let cacheTableReady: Promise<unknown> | null = null;
async function ensureCacheTable(db: D1Database) {
  cacheTableReady ??= db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
  await cacheTableReady;
}

async function cachedGet<T>(cacheKey: string, ttlMs: number, url: string, key: string, extract: (json: unknown) => T | null): Promise<T | null> {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < ttlMs) {
      try { return JSON.parse(row.payload) as T; } catch { /* refetch */ }
    }
  }

  try {
    const response = await fetch(url, { headers: { "x-apisports-key": key, Accept: "application/json" } });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const json = await response.json();
    const result = extract(json);
    if (result === null) throw new Error("empty");
    if (db) {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(result), Date.now()).run();
    }
    return result;
  } catch {
    if (db) {
      const stale = await db.prepare("SELECT payload FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string }>();
      if (stale) { try { return JSON.parse(stale.payload) as T; } catch { /* fall through */ } }
    }
    return null;
  }
}

function currentSeasonYear() {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export async function getPlayerProfile(playerId: number): Promise<PlayerProfile | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  if (!key) return null;
  const season = currentSeasonYear();
  // Cache key bumped to v2: the stored shape now carries statistics, and a
  // v1 row would deserialise into a profile whose table is silently empty.
  return cachedGet<PlayerProfile>(
    `apifootball:v2:playerprofile:${playerId}`,
    24 * 60 * 60 * 1000,
    `https://v3.football.api-sports.io/players?id=${playerId}&season=${season}`,
    key,
    (json) => {
      const entry = (json as { response?: ApiFootballPlayerProfile[] })?.response?.[0];
      if (!entry) return null;
      const p = entry.player;

      const statistics: PlayerSeasonStat[] = (entry.statistics ?? [])
        .map((row) => ({
          league: row.league?.name ?? "—",
          leagueLogo: row.league?.logo ?? null,
          team: armenianTeamName(row.team?.name ?? ""),
          teamLogo: row.team?.logo ?? null,
          appearances: row.games?.appearences ?? 0,
          minutes: row.games?.minutes ?? 0,
          goals: row.goals?.total ?? 0,
          assists: row.goals?.assists ?? 0,
          yellow: row.cards?.yellow ?? 0,
          red: row.cards?.red ?? 0,
          rating: row.games?.rating ? Number(row.games.rating).toFixed(2) : null,
        }))
        // A player registered for a competition he never played in comes back
        // as a row of zeroes, which pads the table without saying anything.
        .filter((row) => row.appearances > 0)
        .sort((a, b) => b.appearances - a.appearances);

      // No single "current team" field exists - the API reports one entry per
      // competition. The competition he has played most is the best proxy.
      const primary = statistics[0];
      const withPosition = (entry.statistics ?? []).find((row) => row.games?.position);
      const withNumber = (entry.statistics ?? []).find((row) => typeof row.games?.number === "number");

      return {
        id: p.id,
        name: p.name,
        photo: p.photo ?? null,
        nationality: p.nationality ?? null,
        birthDate: p.birth?.date ?? null,
        birthPlace: p.birth?.place ?? null,
        height: p.height ?? null,
        weight: p.weight ?? null,
        age: p.age ?? null,
        position: withPosition?.games?.position ?? null,
        currentTeam: primary?.team ?? null,
        currentTeamLogo: primary?.teamLogo ?? null,
        shirtNumber: withNumber?.games?.number ?? null,
        season,
        statistics,
      };
    },
  );
}

export async function getPlayerTransfers(playerId: number): Promise<TransferEntry[]> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  if (!key) return [];
  const result = await cachedGet<TransferEntry[]>(
    `apifootball:v2:transfers:${playerId}`,
    24 * 60 * 60 * 1000,
    `https://v3.football.api-sports.io/transfers?player=${playerId}`,
    key,
    (json) => {
      const entry = (json as { response?: ApiFootballTransfer[] })?.response?.[0];
      if (!entry?.transfers?.length) return null;
      return entry.transfers
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((t) => ({
        date: t.date,
        teamOut: armenianTeamName(t.teams.out.name),
        teamOutLogo: t.teams.out.logo ?? null,
        teamIn: armenianTeamName(t.teams.in.name),
        teamInLogo: t.teams.in.logo ?? null,
        type: t.type,
      }));
    },
  );
  return result ?? [];
}
