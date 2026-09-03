import { armenianCompetition, armenianCountry } from "./names-hy";
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

// One retry, immediately. The failures that produced 404s on a first visit
// were transient - the same URL answered a second later - and a single
// extra attempt costs one API call only when something has already gone
// wrong. Retrying more than once would turn a real outage into a stall.
async function fetchApi(url: string, key: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "x-apisports-key": key, Accept: "application/json" } });
      if (response.ok) return response;
    } catch { /* fall through to the retry */ }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

let cacheTableReady: Promise<unknown> | null = null;
async function ensureCacheTable(db: D1Database) {
  cacheTableReady ??= db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
  await cacheTableReady;
}

// `legacyKeys` are the cache keys this value used to be stored under. They
// are only ever read, and only when a live fetch has just failed: bumping a
// key empties the cache, and without this a page that had been serving a
// cached profile for a day starts answering 404 the moment the upstream API
// is out of quota. An older row is the wrong shape in some small way - that
// is why the key moved - but it is a page instead of a dead end, and the
// next successful fetch replaces it.
async function cachedGet<T>(cacheKey: string, ttlMs: number, url: string, key: string, extract: (json: unknown) => T | null, legacyKeys: string[] = []): Promise<T | null> {
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
    const response = await fetchApi(url, key);
    if (!response) throw new Error("unreachable");
    const json = await response.json();
    const result = extract(json);
    if (result === null) throw new Error("empty");
    if (db) {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(result), Date.now()).run();
    }
    return result;
  } catch {
    if (db) {
      for (const staleKey of [cacheKey, ...legacyKeys]) {
        const stale = await db.prepare("SELECT payload FROM api_cache WHERE cache_key=?").bind(staleKey).first<{ payload: string }>();
        if (stale) { try { return JSON.parse(stale.payload) as T; } catch { /* try the next one */ } }
      }
    }
    return null;
  }
}

function currentSeasonYear() {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// The bio-only endpoint. It takes no season, so it answers for a player the
// season-scoped endpoint has nothing on - a squad player who has not been
// used this year, which is most of an Armenian league bench.
type ApiFootballPlayerBio = { player?: ApiFootballPlayerProfile["player"] };

async function fetchBioOnly(playerId: number, key: string): Promise<PlayerProfile | null> {
  return cachedGet<PlayerProfile>(
    `apifootball:v1:playerbio:${playerId}`,
    7 * 24 * 60 * 60 * 1000,
    `https://v3.football.api-sports.io/players/profiles?player=${playerId}`,
    key,
    (json) => {
      const p = (json as { response?: ApiFootballPlayerBio[] })?.response?.[0]?.player;
      if (!p?.id || !p.name) return null;
      return {
        id: p.id,
        name: p.name,
        photo: p.photo ?? null,
        nationality: p.nationality ? armenianCountry(p.nationality) : null,
        birthDate: p.birth?.date ?? null,
        birthPlace: p.birth?.place ?? null,
        height: p.height ?? null,
        weight: p.weight ?? null,
        age: p.age ?? null,
        position: null,
        currentTeam: null,
        currentTeamLogo: null,
        shirtNumber: null,
        season: currentSeasonYear(),
        statistics: [],
      };
    },
  );
}

export async function getPlayerProfile(playerId: number): Promise<PlayerProfile | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  if (!key) return null;
  // Try this season, then last season, then the bio-only endpoint. Linking a
  // lineup name to a page that answers 404 is worse than linking nothing, and
  // the season-scoped endpoint returns an empty response for any player who
  // has not appeared this year. The extra calls only happen when the first
  // one comes back empty, and the answer is cached either way.
  const season = currentSeasonYear();
  return (
    (await profileForSeason(playerId, key, season)) ??
    (await profileForSeason(playerId, key, season - 1)) ??
    (await fetchBioOnly(playerId, key))
  );
}

async function profileForSeason(playerId: number, key: string, season: number): Promise<PlayerProfile | null> {
  // Cache key bumped on every change to what gets stored: the payload now
  // carries statistics (v2) and Armenian country/competition names (v3), and
  // an older row would keep serving the previous shape for a whole day.
  return cachedGet<PlayerProfile>(
    `apifootball:v3:playerprofile:${playerId}:${season}`,
    24 * 60 * 60 * 1000,
    `https://v3.football.api-sports.io/players?id=${playerId}&season=${season}`,
    key,
    (json) => {
      const entry = (json as { response?: ApiFootballPlayerProfile[] })?.response?.[0];
      if (!entry) return null;
      const p = entry.player;

      const statistics: PlayerSeasonStat[] = (entry.statistics ?? [])
        .map((row) => ({
          league: armenianCompetition(row.league?.name) || "—",
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
        nationality: p.nationality ? armenianCountry(p.nationality) : null,
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
    [`apifootball:v3:playerprofile:${playerId}`, `apifootball:v2:playerprofile:${playerId}`],
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
