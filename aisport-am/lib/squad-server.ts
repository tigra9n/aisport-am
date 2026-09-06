import { armenianCountry } from "./names-hy";
import { armenianPlayerName } from "./player-names-hy";
import { COACH_OVERRIDES } from "./coach-overrides";
import { armenianTeamName } from "./team-names-hy";

// key is ESPN's id under an "espn-" prefix; id stays API-Football's number
// so the squads still in the cache from before the move keep working. The
// card links to whichever it has.
// latin is the provider's own spelling, kept only so the photograph source
// can be matched on it. The card renders name, which is Armenian, and an
// Armenian name has no letters in common with "Gabriel Magalhaes".
export type SquadPlayer = { id: number; key?: string | null; name: string; latin?: string; number: number | null; position: string; age: number | null; photo: string | null };
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
// Three attempts, backing off. Two was not enough: Barcelona's team page
// came back with no manager at all, because that club's coach had never been
// cached, the cache key had just been bumped, and the one live call it fell
// back on failed. A page that quietly drops a section is worse than a slow
// one - the reader cannot tell the difference between "no manager" and
// "we could not ask".
const RETRY_DELAYS_MS = [250, 750];

async function fetchApi(url: string, key: string): Promise<Response | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "x-apisports-key": key, Accept: "application/json" } });
      if (response.ok) return response;
    } catch { /* fall through to the retry */ }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  console.error(`[squad-server] gave up on ${url.split("?")[0]} after ${RETRY_DELAYS_MS.length + 1} attempts`);
  return null;
}

let cacheTableReady: Promise<unknown> | null = null;
async function ensureCacheTable(db: D1Database) {
  cacheTableReady ??= db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
  await cacheTableReady;
}


// Which competition a club plays in, by ESPN's id. The roster endpoint is
// addressed by league and club together and a link only carries the club,
// so the index is built from ESPN's team lists - seventeen requests - and
// kept for a day, because clubs change competition twice a year.
async function teamIndex(db: D1Database | undefined): Promise<Record<string, { slug: string; name: string }>> {
  // v2 on 6 September. The index was cached for a day when its entries held
  // only a slug; the club's name was added to it later, for TheSportsDB to
  // search by, and a day-old row has no name in it - so the photo lookup
  // asked that source for a club called "undefined", found nothing, and a
  // squad page showed the two or three faces ESPN itself carries. Bumping
  // the version is how this codebase forces a refetch.
  const cacheKey = "espn:teamindex:v2";
  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 24 * 60 * 60 * 1000) {
      try {
        const parsed = JSON.parse(row.payload) as Record<string, { slug: string; name: string }>;
        if (Object.keys(parsed).length) return parsed;
      } catch { /* rebuild */ }
    }
  }
  const { espnTeamIndex } = await import("./espn");
  const index = await espnTeamIndex();
  if (db && Object.keys(index).length) {
    await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(index), Date.now()).run();
  }
  return index;
}


// A club's faces, from TheSportsDB, kept for a month: a squad photograph
// does not change on a Tuesday, and that source rate-limits Cloudflare's
// addresses hard enough that asking it per page view is how it starts
// answering 429 to everything.
// v2 on 6 September: the stored map is keyed by the name with its word
// breaks kept, so pickPhoto can compare a two-name spelling against a
// four-name one. The v1 rows are keyed the old way and would match nothing,
// so they are left to expire rather than read.
//
// These rows are normally written by .github/workflows/squad-photos.yml,
// weekly, not by this function. MEASURED from inside the Worker on the day
// the name matching was fixed: two faces on a squad of twenty-four, and
// TheSportsDB answering 429 - Cloudflare's own error 1015. It refuses this
// Worker about every other request and a GitHub runner never, so the runner
// collects the photographs and writes them here.
//
// The fetch below stays as the fallback for a club the weekly run has not
// reached yet. It costs one refused request and then goes quiet for five
// minutes (see sportsDb in espn.ts), and it heals itself the moment
// TheSportsDB does answer.
async function clubPhotos(db: D1Database | undefined, espnId: string, clubName: string): Promise<Record<string, string>> {
  const cacheKey = `sportsdb:photos:v2:${espnId}`;
  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 30 * 24 * 60 * 60 * 1000) {
      try { return JSON.parse(row.payload) as Record<string, string>; } catch { /* refetch */ }
    }
  }
  try {
    if (!clubName) return {};
    const { sportsDbSquadPhotos } = await import("./espn");
    const photos = await sportsDbSquadPhotos(clubName);
    if (db && Object.keys(photos).length) {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(photos), Date.now()).run();
    }
    return photos;
  } catch {
    return {};
  }
}


// Faces on a squad, from TheSportsDB, applied at read time rather than
// stored with it. Players ESPN already has a headshot for keep it.
async function withFaces(squad: Squad, db: D1Database | undefined, espnId: string, clubName: string): Promise<Squad> {
  const missing = squad.players.filter((p) => !p.photo).length;
  if (missing <= squad.players.length / 3) return squad;
  const photos = await clubPhotos(db, espnId, clubName);
  if (!Object.keys(photos).length) return squad;
  const { pickPhoto } = await import("./espn");
  return {
    ...squad,
    players: squad.players.map((p) => ({ ...p, photo: p.photo ?? pickPhoto(photos, p.latin ?? "") })),
  };
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
  const cacheKey = `apifootball:v5:coach:${teamId}`;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 24 * 60 * 60 * 1000) {
      try { return JSON.parse(row.payload) as Coach; } catch { /* refetch */ }
    }
  }

  try {
    // A club we have been told the API is wrong about: find the named coach
    // instead of reading the team's list. Their own entry carries the photo,
    // nationality, age and career, so the page loses nothing.
    const override = COACH_OVERRIDES[teamId];
    if (override) {
      const found = await fetchApi(`https://v3.football.api-sports.io/coachs?search=${encodeURIComponent(override)}`, key);
      const searched = found ? (await found.json() as { response?: ApiFootballCoach[] }).response ?? [] : [];
      // Prefer one whose career actually mentions this club, in case the
      // search is ambiguous; otherwise the first match on the name.
      const named = searched.filter((c) => c.name.toLowerCase().includes(override.toLowerCase()));
      const best = named.find((c) => c.career.some((stint) => stint.team.id === teamId)) ?? named[0];
      if (best) {
        const coach = mapCoach(best);
        if (db) {
          await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(coach), Date.now()).run();
        }
        return coach;
      }
      // Falling through is deliberate: a search that finds nobody should
      // leave the club with the API's answer rather than with no coach.
    }

    const response = await fetchApi(`https://v3.football.api-sports.io/coachs?team=${teamId}`, key);
    if (!response) throw new Error("unreachable");
    const data = await response.json() as { response?: ApiFootballCoach[] };
    // The endpoint returns every coach who has managed the team, and more
    // than one of them can be missing an end date: Liverpool comes back
    // with Slot (2024), Iraola (2026) and Bertoldi (2017) all still open,
    // and taking the first one named Slot as the current manager. So among
    // the open stints, the current manager is the one who started last.
    const openStints = (data.response ?? []).flatMap((coach) => {
      const stint = coach.career.find((s) => s.team.id === teamId && !s.end);
      return stint ? [{ coach, start: stint.start ?? "" }] : [];
    });
    openStints.sort((a, b) => b.start.localeCompare(a.start));
    const current = openStints[0]?.coach ?? data.response?.[0];
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
      for (const staleKey of [cacheKey, `apifootball:v4:coach:${teamId}`, `apifootball:v3:coach:${teamId}`]) {
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

// The id is a string now because two providers number clubs differently and
// a bare number cannot say which is meant. An "espn-" prefix is ESPN's;
// anything else is API-Football's, which is what every indexed URL on this
// site carries and what the team page redirects away from.
export async function getSquad(teamId: number | string): Promise<Squad | null> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const key = runtime.API_FOOTBALL_KEY;

  const db = (env as unknown as { DB?: D1Database }).DB;
  // v5 on 6 September: the row now carries the provider's own spelling of a
// player's name beside the Armenian one, because the photograph source is
// matched on letters and an Armenian name has none in common with
// "Gabriel Magalhaes". A v4 row has no such field, so it can never be
// given a face.
  const cacheKey = `apifootball:v5:squad:${teamId}`;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.savedAt && Date.now() - row.savedAt < 24 * 60 * 60 * 1000) {
      try {
        const squad = JSON.parse(row.payload) as Squad;
        // A cached squad still asks for the faces, because the squad and the
        // faces are cached apart and on different clocks: a day for the
        // squad, a month for the photographs, and the photographs may have
        // arrived since - or been refused when the squad was stored.
        if (squad.players.length) {
          const espnKeyed = typeof teamId === "string" && teamId.startsWith("espn-") ? teamId.slice(5) : null;
          if (!espnKeyed) return squad;
          const club = (await teamIndex(db))[espnKeyed];
          return withFaces(squad, db, espnKeyed, club?.name ?? "");
        }
      } catch { /* refetch */ }
    }
  }

  // ESPN, when the link carries ESPN's number. One request returns the whole
  // squad with the shirt number, the position, the age and a headshot each -
  // the photos API-Football charged for - and it costs nothing.
  const espnId = typeof teamId === "string" && teamId.startsWith("espn-") ? teamId.slice(5) : null;
  if (espnId) {
    try {
      const { espnSquad } = await import("./espn");
      const team = (await teamIndex(db))[espnId];
      if (team) {
        const fetched = await espnSquad(team.slug, espnId);
        if (fetched?.players.length) {
          const squad: Squad = {
            teamName: fetched.teamName,
            teamLogo: fetched.teamLogo,
            players: fetched.players.map((p) => ({
              id: Number(p.id),
              key: `espn-${p.id}`,
              name: armenianPlayerName(p.name),
              latin: p.name,
              number: p.number,
              position: p.position,
              age: p.age,
              photo: p.photo,
            })),
          };
          // The squad is cached as ESPN gives it, faces and all. The faces
          // are added after, never before: TheSportsDB rate-limits
          // Cloudflare's addresses and answers 429 often enough that the
          // first visit to a club can come back without them - and storing
          // that squad would have kept a club faceless for a day, because
          // the row would be fresh and nothing would ask again.
          if (db) {
            await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, JSON.stringify(squad), Date.now()).run();
          }
          return withFaces(squad, db, espnId, team.name);
        }
      }
    } catch { /* fall through to the stale row below */ }
    return null;
  }

  try {
    if (!key) throw new Error("no key");
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
