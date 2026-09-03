import { armenianCountry } from "./names-hy";
import { armenianPlayerName } from "./player-names-hy";
import { armenianTeamName } from "./team-names-hy";

export type SquadPlayer = { id: number; name: string; number: number | null; position: string; age: number | null; photo: string | null };
export type Squad = { teamName: string; teamLogo: string | null; players: SquadPlayer[] };

const POSITION_LABEL: Record<string, string> = {
  Goalkeeper: "Դարպասապահներ",
  Defender: "Պաշտպաններ",
  Midfielder: "Կիսապաշտպաններ",
  Attacker: "Հարձակվողներ",
};
export const POSITION_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Attacker"];

type ApiFootballSquad = {
  team: { name: string; logo?: string | null };
  players: { id: number; name: string; number: number | null; position: string; age: number | null; photo?: string | null }[];
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

export function positionLabel(position: string) {
  return POSITION_LABEL[position] ?? position;
}

export type CoachCareerEntry = { team: string; teamLogo: string | null; start: string | null; end: string | null };
export type Coach = { id: number; name: string; photo: string | null; nationality: string | null; age: number | null; career: CoachCareerEntry[] };

type ApiFootballCoach = {
  id: number;
  name: string;
  photo?: string | null;
  nationality?: string | null;
  age?: number | null;
  career: { team: { id: number; name: string; logo?: string | null }; start: string | null; end: string | null }[];
};

function mapCoach(raw: ApiFootballCoach): Coach {
  return {
    id: raw.id,
    name: raw.name,
    photo: raw.photo ?? null,
    nationality: raw.nationality ? armenianCountry(raw.nationality) : null,
    age: raw.age ?? null,
    career: raw.career.map((c) => ({ team: armenianTeamName(c.team.name), teamLogo: c.team.logo ?? null, start: c.start, end: c.end })),
  };
}

export async function getCoach(teamId: number): Promise<Coach | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  if (!key) return null;

  const db = (env as unknown as { DB?: D1Database }).DB;
  const cacheKey = `apifootball:v3:coach:${teamId}`;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 24 * 60 * 60 * 1000) {
      try { return JSON.parse(row.payload) as Coach; } catch { /* refetch */ }
    }
  }

  try {
    const response = await fetchApi(`https://v3.football.api-sports.io/coachs?team=${teamId}`, key);
    if (!response) throw new Error("unreachable");
    const data = await response.json() as { response?: ApiFootballCoach[] };
    // The endpoint returns every coach who's managed the team; the current
    // one is whichever entry has no end date on their stint with this team.
    const current = data.response?.find((c) => c.career.some((stint) => stint.team.id === teamId && !stint.end)) ?? data.response?.[0];
    if (!current) throw new Error("empty");
    const coach = mapCoach(current);
    if (db) {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(coach), Date.now()).run();
    }
    return coach;
  } catch {
    if (db) {
      // Also read the previous key: bumping it empties the cache, and without
      // this the page answers 404 whenever the upstream API is unavailable.
      for (const staleKey of [cacheKey, `apifootball:v2:coach:${teamId}`]) {
        const stale = await db.prepare("SELECT payload FROM api_cache WHERE cache_key=?").bind(staleKey).first<{ payload: string }>();
        if (stale) { try { return JSON.parse(stale.payload) as Coach; } catch { /* try the next one */ } }
      }
    }
    return null;
  }
}

export async function getCoachById(coachId: number): Promise<Coach | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  if (!key) return null;

  const db = (env as unknown as { DB?: D1Database }).DB;
  const cacheKey = `apifootball:v2:coachbyid:${coachId}`;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 24 * 60 * 60 * 1000) {
      try { return JSON.parse(row.payload) as Coach; } catch { /* refetch */ }
    }
  }

  try {
    const response = await fetchApi(`https://v3.football.api-sports.io/coachs?id=${coachId}`, key);
    if (!response) throw new Error("unreachable");
    const data = await response.json() as { response?: ApiFootballCoach[] };
    const raw = data.response?.[0];
    if (!raw) throw new Error("empty");
    const coach = mapCoach(raw);
    if (db) {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(coach), Date.now()).run();
    }
    return coach;
  } catch {
    if (db) {
      for (const staleKey of [cacheKey, `apifootball:v1:coachbyid:${coachId}`]) {
        const stale = await db.prepare("SELECT payload FROM api_cache WHERE cache_key=?").bind(staleKey).first<{ payload: string }>();
        if (stale) { try { return JSON.parse(stale.payload) as Coach; } catch { /* try the next one */ } }
      }
    }
    return null;
  }
}

export async function getSquad(teamId: number): Promise<Squad | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;
  if (!key) return null;

  const db = (env as unknown as { DB?: D1Database }).DB;
  const cacheKey = `apifootball:v3:squad:${teamId}`;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 24 * 60 * 60 * 1000) {
      try {
        const squad = JSON.parse(row.payload) as Squad;
        if (squad.players.length) return squad;
      } catch { /* refetch */ }
    }
  }

  try {
    const response = await fetchApi(`https://v3.football.api-sports.io/players/squads?team=${teamId}`, key);
    if (!response) throw new Error("unreachable");
    const data = await response.json() as { response?: ApiFootballSquad[] };
    const entry = data.response?.[0];
    if (!entry?.players?.length) throw new Error("empty");
    const squad: Squad = {
      teamName: armenianTeamName(entry.team.name),
      teamLogo: entry.team.logo ?? null,
      players: entry.players.map((p) => ({ id: p.id, name: armenianPlayerName(p.name), number: p.number, position: p.position, age: p.age, photo: p.photo ?? null })),
    };
    if (db) {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(squad), Date.now()).run();
    }
    return squad;
  } catch {
    if (db) {
      const stale = await db.prepare("SELECT payload FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string }>();
      if (stale) {
        try {
          const squad = JSON.parse(stale.payload) as Squad;
          if (squad.players.length) return squad;
        } catch { /* fall through */ }
      }
    }
    return null;
  }
}
