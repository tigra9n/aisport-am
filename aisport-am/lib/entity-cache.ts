// What we already know about a team or a player, without asking the API.
//
// The team and player pages turned a failed fetch into a 404 - which is
// how a first visit to an uncached page could answer "does not exist"
// while a refresh a second later answered fine, and how Google recorded
// 404s for pages that work. A 404 is a statement that the page is not
// there, and it should only be made when that is true.
//
// The standings and top-scorer tables are already in the cache for every
// tracked league, and between them they carry the name, the badge and the
// photo of exactly the teams and players the site links to. Reading those
// rows costs one D1 query and no API call, which makes them the right
// thing to fall back on: the page still renders, with the name the reader
// clicked on, instead of a dead end.
import type { StandingRow } from "./football";
import type { TopScorer } from "./topscorers-server";

const LEAGUE_IDS = [39, 140, 135, 78, 61, 307, 253, 342];

function currentSeasonYear() {
  const now = new Date();
  return now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

async function readCached<T>(keys: string[]): Promise<T[]> {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return [];
  const out: T[] = [];
  try {
    const placeholders = keys.map(() => "?").join(",");
    const rows = await db
      .prepare(`SELECT payload FROM api_cache WHERE cache_key IN (${placeholders})`)
      .bind(...keys)
      .all<{ payload: string }>();
    for (const row of rows.results ?? []) {
      try { out.push(JSON.parse(row.payload) as T); } catch { /* skip a bad row */ }
    }
  } catch { /* the table may not exist yet on a cold worker */ }
  return out;
}

export type KnownTeam = { name: string; logo: string | null };

export async function knownTeam(teamId: number): Promise<KnownTeam | null> {
  const season = currentSeasonYear();
  const tables = await readCached<StandingRow[]>(
    // Both versions: v4 is what the writer fills now, v3 is what is still in
    // the table until it expires. This lookup only answers "does this club
    // exist and what is its badge", and an older row is a better answer than
    // a 404 - which is the whole reason this file exists.
    [
      ...LEAGUE_IDS.map((id) => `apifootball:v6:standings:${id}:${season}`),
    ...LEAGUE_IDS.map((id) => `apifootball:v5:standings:${id}:${season}`),
    ...LEAGUE_IDS.map((id) => `apifootball:v4:standings:${id}:${season}`),
      ...LEAGUE_IDS.map((id) => `apifootball:v3:standings:${id}:${season}`),
    ],
  );
  for (const rows of tables) {
    for (const row of rows ?? []) {
      if (row.teamId === teamId) return { name: row.team, logo: row.teamLogo };
    }
  }
  return null;
}

export type KnownPlayer = { name: string; photo: string | null; team: string | null };

export async function knownPlayer(playerId: number): Promise<KnownPlayer | null> {
  const season = currentSeasonYear();
  const tables = await readCached<TopScorer[]>([
    ...LEAGUE_IDS.map((id) => `apifootball:v7:topscorers:${id}:${season}`),
    ...LEAGUE_IDS.map((id) => `apifootball:v6:topscorers:${id}:${season}`),
    ...LEAGUE_IDS.map((id) => `apifootball:v5:topscorers:${id}:${season}`),
    // Previous keys, still worth reading while the new one fills up. This
    // lookup only answers "does this player exist, and what is their
    // photo" - an older row with a Latin name is a better answer than a
    // 404 page.
    ...LEAGUE_IDS.map((id) => `apifootball:v4:topscorers:${id}:${season}`),
    ...LEAGUE_IDS.map((id) => `apifootball:v3:topscorers:${id}:${season}`),
  ]);
  for (const rows of tables) {
    for (const row of rows ?? []) {
      if (row.id === playerId) return { name: row.name, photo: row.photo, team: row.team };
    }
  }
  return knownFromSquad(playerId);
}

// The squads, when the scoring charts have never heard of the man.
//
// MEASURED: /player/497488 answered 404 while the club's own squad page
// was linking to it. Nothing is wrong with the link - it is an Armenian
// league footballer, and the three API-Football endpoints the player page
// asks (this season, last season, the bio) all came back empty for him,
// which is what happens to a squad player who has not been used. A reader
// who clicks a name on a squad page and is told the page does not exist
// has been told something false: the site knew his name, his club, his
// number and his face a moment earlier.
//
// So the squad row itself is the fallback. Only the API-Football squads
// are read - the keys without "espn-" - because these ids are
// API-Football's, and an ESPN squad numbers its players separately: the
// same number is a different man there, and showing the wrong footballer
// is worse than the 404 this replaces.
async function knownFromSquad(playerId: number): Promise<KnownPlayer | null> {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return null;
  try {
    const rows = await db
      .prepare("SELECT payload FROM api_cache WHERE cache_key LIKE 'apifootball:v5:squad:%' AND cache_key NOT LIKE 'apifootball:v5:squad:espn-%' AND payload LIKE ?")
      .bind(`%"id":${playerId},%`)
      .all<{ payload: string }>();
    for (const row of rows.results ?? []) {
      let squad: { teamName?: string; players?: { id: number; name: string; photo?: string | null }[] };
      try { squad = JSON.parse(row.payload); } catch { continue; }
      const player = squad.players?.find((entry) => entry.id === playerId);
      if (player) return { name: player.name, photo: player.photo ?? null, team: squad.teamName ?? null };
    }
  } catch { /* the table may not exist yet on a cold worker */ }
  return null;
}

// Does this club also exist at ESPN, and where?
//
// MEASURED: an Armenian club's page took seconds to open from the table.
// The team page redirects a bare API-Football number to the ESPN page when
// there is one, and it found out by asking findEspnTeamByName - which walks
// all seventeen ESPN competitions in order, one after another, and for an
// Armenian club never matches any of them, because ESPN has no Armenian
// league. Seventeen team lists, on every request, before the page even
// began loading the squad.
//
// Two things fix it. An Armenian club is known here and never searched for:
// the answer is no, and it will still be no tomorrow. And every other
// answer is remembered - a hit for a month, because clubs move between
// competitions twice a year, a miss for a day, because a miss can also mean
// the standings row that carries the club's name had not been filled yet.
export async function espnTwinUrl(legacyId: number): Promise<string | null> {
  const { ARMENIAN_CLUB_IDS } = await import("./highlightly");
  if (Object.values(ARMENIAN_CLUB_IDS).includes(legacyId)) return null;

  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  const cacheKey = `espn:twin:${legacyId}`;
  if (db) {
    try {
      await db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
      const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
      if (row?.savedAt) {
        const age = Date.now() - row.savedAt;
        const ttl = row.payload ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        if (age < ttl) return row.payload || null;
      }
    } catch { /* the table may not exist yet on a cold worker */ }
  }

  let url: string | null = null;
  try {
    // The proved map first.
    //
    // What follows it resolves the old number to a club NAME and then
    // looks that name up among ESPN's clubs, which is a guess: two clubs
    // whose names look alike send a reader who clicked on one to the
    // other, permanently, with a 301. lib/team-map.ts holds two hundred
    // and seven pairs that were not guessed - both providers' squads were
    // fetched and share at least four surnames - so those are answered
    // from the table and never reach the name matcher.
    //
    // It is also free and instant: no fetch, no seventeen ESPN league
    // lists, which is what made the Armenian club page slow enough to be
    // reported by a reader.
    const { espnTeamFor } = await import("./team-map");
    const proved = espnTeamFor(legacyId);
    if (proved) {
      const { espnKey } = await import("./espn");
      url = `/team/${espnKey(proved)}`;
    } else {
      const known = await knownTeam(legacyId);
      if (known?.name) {
        const { findEspnTeamByName, espnKey } = await import("./espn");
        const team = await findEspnTeamByName(known.name);
        url = team ? `/team/${espnKey(team.id)}` : null;
      }
    }
  } catch { /* remembered as a miss, and asked again tomorrow */ }

  if (db) {
    try {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, url ?? "", Date.now()).run();
    } catch { /* not being able to remember is not a reason to fail */ }
  }
  return url;
}

/**
 * Where an indexed /player/<n> should go now, or null.
 *
 * The club map cannot answer this - it maps clubs, and there are
 * thousands of footballers - so this is decided on the name, by
 * chooseAthlete, which refuses a family name two men share unless the
 * club separates them. A wrong answer here is a permanent redirect
 * telling a reader that one footballer is another, so refusing is the
 * default and the caller renders the page it always did.
 *
 * Nothing is fetched. Both sides are already in this site's own cache:
 * the ESPN athlete indexes that the scoring charts build, and the name
 * the top-scorer rows carry. That matters because the alternative - a
 * roster fetch per league on a page view - is exactly what made the
 * Armenian club page slow enough for a reader to notice.
 */
export async function espnPlayerTwinUrl(legacyId: number): Promise<string | null> {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  const cacheKey = `espn:playertwin:${legacyId}`;
  if (db) {
    try {
      await db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
      const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
      if (row?.savedAt) {
        // A hit is remembered for a month, a miss for a day: the athlete
        // indexes fill in over time, so today's "nobody" can be tomorrow's
        // answer.
        const ttl = row.payload ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        if (Date.now() - row.savedAt < ttl) return row.payload || null;
      }
    } catch { /* the table may not exist yet on a cold worker */ }
  }

  let url: string | null = null;
  try {
    const known = await knownPlayer(legacyId);
    if (known?.name) {
      const { ESPN_SLUG_BY_CODE, espnKey } = await import("./espn");
      const { chooseAthlete } = await import("./club-match");
      const indexes = await readCached<Record<string, { name: string; team: string }>>(
        Object.values(ESPN_SLUG_BY_CODE).map((slug) => `espn:athletes:${slug}`),
      );
      const candidates = indexes.flatMap((index) =>
        Object.entries(index ?? {}).map(([id, row]) => ({ id, name: row.name, team: row.team })),
      );
      // The ESPN index spells a name the way ESPN writes it; the row this
      // started from was spelled in Armenian by armenianPlayerName. Both
      // go through that same function here, so the comparison is between
      // two spellings made by one hand rather than by two providers.
      const { armenianPlayerName } = await import("./player-names-hy");
      const found = chooseAthlete(
        known.name,
        candidates.map((row) => ({ ...row, name: armenianPlayerName(row.name) })),
        known.team,
      );
      url = found ? `/player/${espnKey(found.id)}` : null;
    }
  } catch { /* remembered as a miss, and asked again tomorrow */ }

  if (db) {
    try {
      await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`).bind(cacheKey, url ?? "", Date.now()).run();
    } catch { /* not being able to remember is not a reason to fail */ }
  }
  return url;
}
