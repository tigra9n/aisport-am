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
