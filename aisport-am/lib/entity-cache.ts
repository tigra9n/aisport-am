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
  return null;
}
