import type { ArmenianMatch } from "./espn";
import type { LineupPlayer, LiveMatchDetail } from "./live-football-server";
import type { StandingRow } from "./football";
import { formatTimeYerevan } from "./format-date";
import { armenianTeamName } from "./team-names-hy";

// Highlightly, for the one table this site exists for.
//
// MEASURED on 6 September, against the league's own standings, club by
// club: eleven of twelve exactly right, and the twelfth was this file's
// name matching rather than their data. That is the standard nothing else
// free has met.
//
//   TheSportsDB's summary        five rows of a twelve-club league
//   TheSportsDB counted by date  twelve rows, four of them wrong - two
//                                matches with the result on the wrong side
//   ESPN                         no Armenian competition at all
//   Highlightly                  twelve rows, right
//
// The free BASIC plan carries it: a hundred requests a day, and this needs
// four. The key is a worker secret, written by cf-deploy.sh like the rest.
const HOST = "https://sports.highlightly.net/football";

// The Armenian Premier League, from Highlightly's own /leagues answer for
// countryName=Armenia. Its First League is 292677, which this site does not
// cover.
const ARMENIAN_LEAGUE = "291826";

type HighlightlySide = {
  wins?: number; draws?: number; loses?: number; games?: number;
  scoredGoals?: number; receivedGoals?: number;
};
type HighlightlyRow = {
  position?: number;
  points?: number | null;
  // A total is in the row after all - it was not in the first sample and
  // this file added home and away by hand because of that. Both are kept:
  // total when it is there, the sum when it is not.
  total?: HighlightlySide;
  home?: HighlightlySide;
  away?: HighlightlySide;
  team?: { id?: number; name?: string; logo?: string | null };
};
type HighlightlyStandings = { groups?: { name?: string; standings?: HighlightlyRow[] }[] };

// The Armenian clubs at API-Football, keyed by their Armenian name.
//
// The table moved here and the rows lost their links with it: Highlightly
// numbers clubs its own way and /team/<number> does not run on those
// numbers, so rather than open a page about a different club the code
// opened none. Refusing a wrong link was right; leaving a reader with no
// way in was not - before the move every club name in this table worked.
//
// Keyed on the Armenian name rather than the provider's spelling, so it
// does not matter that this one still writes Noah as Artsakh and Urartu as
// Banants: armenianTeamName has already made them one club by the time
// this is read. A club not on the list simply has no link, which is what
// the whole table had five minutes ago.
//
// MEASURED from API-Football's own /teams?league=342 on 6 September - all
// twelve, and its Armenian squads carry a photograph each.
export const ARMENIAN_CLUB_IDS: Record<string, number> = {
  "Ալաշկերտ": 582,
  "Գանձասար": 688,
  "Փյունիկ": 709,
  "Ուրարտու": 2276,
  "Արարատ": 3682,
  "Արարատ-Արմենիա": 3683,
  "Նոա": 3684,
  "Շիրակ": 3686,
  "ԲԿՄԱ": 6279,
  "Վան": 6286,
  "Սյունիք": 20087,
  "Սարդարապատ": 26198,
};

function currentSeasonYear() {
  const now = new Date();
  return now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/**
 * The Armenian league table, or null.
 *
 * Null on anything unexpected rather than a half table: the caller has the
 * paid provider behind it, and a wrong table is worse than a missing one.
 */
export async function armenianStandingsHighlightly(): Promise<StandingRow[] | null> {
  const { env } = await import("cloudflare:workers");
  const key = (env as unknown as Record<string, string | undefined>).HIGHLIGHTLY_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${HOST}/standings?leagueId=${ARMENIAN_LEAGUE}&season=${currentSeasonYear()}`, {
      // x-rapidapi-key, not x-api-key. MEASURED against this host with
      // both: x-api-key answers 403 "Missing mandatory HTTP Headers" and
      // x-rapidapi-key answers 200, on highlightly.net's own domain rather
      // than RapidAPI's. Shipped with the wrong one first, which meant the
      // Worker quietly fell through to the five-row table while a runner
      // was reading twelve correct ones.
      headers: { "x-rapidapi-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as HighlightlyStandings;
    const rows = data.groups?.[0]?.standings ?? [];
    if (!rows.length) return null;

    // Home and away are separate blocks and there is no total in the
    // response - not games, not goal difference, not points. A club's
    // season is the two added, and the points are three a win plus one a
    // draw. Reading home.games as the matches played is what first made
    // this look like it disagreed with the league; it does not.
    const num = (value: unknown) => Number(value ?? 0) || 0;
    const table = rows.map((row) => {
      const home = row.home ?? {};
      const away = row.away ?? {};
      const total = row.total;
      const sum = (pick: (side: HighlightlySide) => unknown) =>
        total ? num(pick(total)) : num(pick(home)) + num(pick(away));
      const won = sum((side) => side.wins);
      const draw = sum((side) => side.draws);
      const scored = sum((side) => side.scoredGoals);
      const conceded = sum((side) => side.receivedGoals);
      // armenianTeamName carries banants -> Ուրարտու and artsakh -> Նոա,
      // because this provider still files both clubs under the names they
      // dropped in 2019.
      const team = armenianTeamName(row.team?.name ?? "");
      return {
        position: 0,
        team,
        // API-Football's number, which is what /team/<number> answers on
        // for a club that is not ESPN's. Highlightly's own number would
        // open a page about a different club, so it is not used.
        teamId: ARMENIAN_CLUB_IDS[team] ?? null,
        teamKey: null,
        teamLogo: row.team?.logo ?? null,
        played: sum((side) => side.games),
        won,
        draw,
        lost: sum((side) => side.loses),
        goalDifference: scored - conceded,
        points: typeof row.points === "number" ? row.points : won * 3 + draw,
      };
    }).filter((row) => row.team);

    // Sorted here, and the position written after: the response arrives in
    // its own order and a table that is not sorted by points is not a
    // table.
    table.sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);
    return table.map((row, index) => ({ ...row, position: index + 1 }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// The Armenian board, and the Armenian match page
// ---------------------------------------------------------------------
//
// Why this moved here on 6 September, before the subscription actually
// ended: the free plan the board was counting on cannot serve this
// season. API-Sports' own pricing page and its support say the free plan
// gives "only seasons between Y-4 and Y-2" - for 2026 that is 2022 to
// 2024 - and it applies to every endpoint, /fixtures?live=all included.
// So the comment above getLiveMatches that said the Armenian minute
// "runs on the free tier, which is not unlimited but is free" was wrong,
// and on 23 September the minute would simply have stopped with nothing
// in the logs to say why. Better to move while the paid key still works
// and can be compared against.
//
// What replaces it, MEASURED on 6 September from a runner:
//
//   /matches?leagueId=291826&date=YYYY-MM-DD   the day's fixtures, with
//     state.clock, state.score and state.description in the same row - so
//     one free source now gives what TheSportsDB (fixtures, no live feed,
//     and four of twelve rows wrong when counted by date) and
//     API-Football (the minute, paid) gave between them.
//   /matches/{id}      the match, carrying venue, referee, events,
//                      statistics and predictions in one response
//   /lineups/{id}      the two lineups
//
// What it does NOT have, asked in every spelling: no squad endpoint
// (/teams/{id}/squad and /squads both 404) and no /top-scorers. Those two
// surfaces hide themselves when empty rather than being faked.
//
// The budget is a hundred requests a day and that is the whole reason for
// the windowing in live-football-server.ts: the board is only asked every
// five minutes from ten minutes before a kick-off to two and a half hours
// after, and once per cache window otherwise. A match day costs about
// thirty; a day with no Armenian football costs almost none.

type HighlightlySide2 = { id?: number; name?: string; logo?: string | null; formation?: string; initialLineup?: unknown; substitutes?: unknown };
type HighlightlyState = { clock?: number | string | null; description?: string | null; score?: unknown };
type HighlightlyMatch = {
  id?: number | string; date?: string; round?: string;
  state?: HighlightlyState;
  homeTeam?: HighlightlySide2; awayTeam?: HighlightlySide2;
  venue?: { name?: string | null; city?: string | null };
  referee?: { name?: string | null };
  events?: unknown; statistics?: unknown;
};

async function highlightly<T>(path: string): Promise<T | null> {
  const { env } = await import("cloudflare:workers");
  const key = (env as unknown as Record<string, string | undefined>).HIGHLIGHTLY_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${HOST}${path}`, {
      headers: { "x-rapidapi-key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    // 429 is "You have breached your daily request limits" and arrives as
    // JSON like everything else. Null means the caller keeps whatever it
    // had cached, which is the right answer for a spent allowance.
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

/**
 * The two numbers on the board.
 *
 * state.score was printed as an object by the probe without its fields
 * being read, so every plausible spelling is accepted rather than one
 * guessed. Whichever it turns out to be, the others cost nothing.
 */
export function readScore(score: unknown): { home: number | null; away: number | null } {
  const none = { home: null, away: null };
  if (!score || typeof score !== "object") return none;
  const s = score as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : null);
  const direct = { home: num(s.home), away: num(s.away) };
  if (direct.home !== null || direct.away !== null) return direct;
  for (const nested of [s.current, s.total, s.fullTime, s.fulltime, s.ft]) {
    if (typeof nested === "string") {
      // "1 - 0", "1-0"
      const m = /^\s*(\d+)\s*[-:]\s*(\d+)\s*$/.exec(nested);
      if (m) return { home: Number(m[1]), away: Number(m[2]) };
    }
    if (nested && typeof nested === "object") {
      const n = nested as Record<string, unknown>;
      const pair = { home: num(n.home), away: num(n.away) };
      if (pair.home !== null || pair.away !== null) return pair;
    }
  }
  // Last resort: walk it. The named spellings above cover what an API of
  // this shape usually sends, but the real one has not been read yet, and
  // a blank score beside a 67th minute is a visible defect on the one
  // board this site exists for. Anything shaped like a score anywhere
  // inside is better than nothing; the walk stops at three levels so a
  // malformed response cannot spin.
  const walk = (value: unknown, depth: number): { home: number | null; away: number | null } | null => {
    if (depth > 3 || !value || typeof value !== "object") return null;
    const bag = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(bag)) {
      if (typeof v === "string") {
        const m = /^\s*(\d{1,2})\s*[-:]\s*(\d{1,2})\s*$/.exec(v);
        if (m) return { home: Number(m[1]), away: Number(m[2]) };
      }
      if (/home/i.test(k) && num(v) !== null) {
        const awayKey = Object.keys(bag).find((other) => /away/i.test(other));
        if (awayKey) return { home: num(v), away: num(bag[awayKey]) };
      }
    }
    for (const v of Object.values(bag)) { const found = walk(v, depth + 1); if (found) return found; }
    return null;
  };
  return walk(s, 0) ?? none;
}

/** Armenian, from state.description and state.clock. */
export function readStatus(state: HighlightlyState | undefined, kickoff: Date | null): { status: string; isLive: boolean; finished: boolean } {
  const said = String(state?.description ?? "").toLowerCase();
  const clock = state?.clock;
  const minute = typeof clock === "number" ? clock : typeof clock === "string" && /^\d+/.test(clock) ? Number.parseInt(clock, 10) : null;
  if (/finish|ended|full.?time|\bft\b|after extra|penalt/.test(said)) return { status: "Ավարտված", isLive: false, finished: true };
  if (/postpon/.test(said)) return { status: "Հետաձգված", isLive: false, finished: false };
  if (/cancel|abandon/.test(said)) return { status: "Չեղարկված", isLive: false, finished: false };
  if (/half.?time|\bht\b/.test(said)) return { status: "Ընդմիջում", isLive: true, finished: false };
  if (minute !== null) return { status: `${minute}′`, isLive: true, finished: false };
  if (/live|1st|2nd|first half|second half|extra|progress/.test(said)) return { status: "LIVE", isLive: true, finished: false };
  return { status: kickoff ? formatTimeYerevan(kickoff.toISOString()) : "", isLive: false, finished: false };
}

/**
 * The Armenian league's matches on one day, or null.
 *
 * Null rather than an empty array when the provider says nothing, so the
 * caller can tell "no football today" from "the allowance is spent" and
 * keep what it already had in the second case.
 */
export async function armenianMatchesHighlightly(date: string): Promise<ArmenianMatch[] | null> {
  const data = await highlightly<HighlightlyMatch[] | { data?: HighlightlyMatch[] }>(`/matches?leagueId=${ARMENIAN_LEAGUE}&date=${date}`);
  if (!data) return null;
  const rows = Array.isArray(data) ? data : data.data;
  if (!Array.isArray(rows)) return null;
  return rows.map((m) => {
    const kickoff = m.date ? new Date(m.date) : null;
    const { status, isLive, finished } = readStatus(m.state, kickoff);
    const score = readScore(m.state?.score);
    const home = armenianTeamName(m.homeTeam?.name ?? "");
    const away = armenianTeamName(m.awayTeam?.name ?? "");
    return {
      id: `hl-${m.id}`,
      status,
      competition: "Հայաստանի Պրեմիեր լիգա",
      home, away,
      // API-Football's numbers again, for the same reason the table uses
      // them: /team/<number> runs on those and Highlightly's own would
      // open a page about a different club.
      homeId: ARMENIAN_CLUB_IDS[home] ?? null,
      awayId: ARMENIAN_CLUB_IDS[away] ?? null,
      homeLogo: m.homeTeam?.logo ?? null,
      awayLogo: m.awayTeam?.logo ?? null,
      // A score before kick-off is not a score. Highlightly sends zeroes
      // for a match that has not started, which would put "0 - 0" on the
      // board hours early.
      homeScore: isLive || finished ? score.home : null,
      awayScore: isLive || finished ? score.away : null,
      isLive,
      kickoffMs: kickoff && !Number.isNaN(kickoff.getTime()) ? kickoff.getTime() : null,
    };
  }).filter((m) => m.home && m.away);
}

// ---------------------------------------------------------------------
// The Armenian match page
// ---------------------------------------------------------------------
//
// One thing to say plainly: the OUTER shape of these three responses was
// measured on 6 September and the endpoints are real, but every array in
// them was empty, because the probe ran eleven minutes before kick-off.
// So the inner field names below - what an event row calls its minute,
// what a lineup row calls a shirt number - are read tolerantly rather
// than assumed: several plausible spellings each, and anything unread
// simply does not render. The tabs in the match modal hide themselves
// when they hold nothing, so a field this file fails to find costs a
// panel, not a broken page. When a played match has been read the
// spellings can be narrowed to the real ones.
//
// Cost: one request before kick-off, two after (the match carries its own
// events and statistics; only the lineups are separate), behind an eight
// minute cache while it is being played and a day's cache once it has
// ended. The owner accepted a ten minute delay on the match centre in
// exchange for the subscription, which is what buys that.

type Bag = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const pick = (bag: unknown, ...keys: string[]): unknown => {
  if (!bag || typeof bag !== "object") return undefined;
  for (const k of keys) { const v = (bag as Bag)[k]; if (v !== undefined && v !== null && v !== "") return v; }
  return undefined;
};
const nameOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  const n = pick(v, "name", "fullName", "displayName", "player");
  return typeof n === "string" ? n : str(pick(n, "name", "fullName"));
};

function readEvents(raw: unknown, sides: { homeName: string; awayName: string; homeId: string; awayId: string }) {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const teamRaw = pick(e, "team", "teamName", "side");
    // The row may name its team or only number it; both are tried, and an
    // event that says neither is still worth its minute and its scorer.
    const numbered = str(pick(e, "teamId", "team_id"));
    const team = nameOf(teamRaw)
      || (numbered && numbered === sides.homeId ? sides.homeName : "")
      || (numbered && numbered === sides.awayId ? sides.awayName : "");
    return {
      minute: str(pick(e, "time", "minute", "elapsed", "clock")).replace(/^(\d+)$/, "$1′"),
      team: armenianTeamName(team) || team,
      player: nameOf(pick(e, "player", "playerName", "scorer", "playerOne")),
      assist: nameOf(pick(e, "assist", "assistName", "assistPlayer", "playerTwo")),
      label: str(pick(e, "type", "eventType", "description", "detail")),
    };
  }).filter((e) => e.player || e.label);
}

function readLineup(side: HighlightlySide2 | undefined, fallbackName: string) {
  const person = (p: unknown, index: number): LineupPlayer => ({
    id: null,
    // Highlightly's player numbers are its own and /player/<n> does not
    // run on them, so a lineup name is text. The alternative was a link
    // to somebody else, which is what the standings learned not to do.
    key: null,
    name: nameOf(p) || `#${index + 1}`,
    number: (() => { const n = pick(p, "number", "shirtNumber", "jersey"); return typeof n === "number" ? n : typeof n === "string" && /^\d+$/.test(n) ? Number(n) : null; })(),
    grid: str(pick(p, "position", "grid", "pos")) || null,
    rating: str(pick(p, "rating")) || null,
  });
  const starters = Array.isArray(side?.initialLineup) ? side!.initialLineup as unknown[] : [];
  const subs = Array.isArray(side?.substitutes) ? side!.substitutes as unknown[] : [];
  // initialLineup arrives nested by row on some feeds of this shape - a
  // list of lines, each a list of players. Flattened one level if so.
  const flat = (rows: unknown[]) => rows.flatMap((r) => (Array.isArray(r) ? r as unknown[] : [r]));
  const name = armenianTeamName(side?.name ?? "") || fallbackName;
  const formation = str(side?.formation);
  return {
    team: name,
    // "Unknown" is what it sends when it has none; printing that beside a
    // club's name reads as a fact about the team.
    formation: /unknown/i.test(formation) ? "" : formation,
    starters: flat(starters).map(person),
    substitutes: flat(subs).map(person),
  };
}

function readStatRows(raw: unknown) {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  const sideRows = (entry: unknown) => {
    const list = pick(entry, "statistics", "stats");
    return Array.isArray(list) ? list as unknown[] : [];
  };
  const asMap = (entry: unknown) => {
    const map = new Map<string, string>();
    for (const row of sideRows(entry)) {
      const label = str(pick(row, "displayName", "name", "type", "label"));
      const value = pick(row, "value", "total", "amount");
      if (label && value !== undefined) map.set(label, str(value));
    }
    return map;
  };
  const home = asMap(raw[0]);
  const away = asMap(raw[1]);
  const labels = [...new Set([...home.keys(), ...away.keys()])];
  return labels.map((label) => ({ label, home: home.get(label) ?? "", away: away.get(label) ?? "" }))
    .filter((row) => row.home !== "" || row.away !== "");
}

/**
 * An Armenian match page, or null.
 *
 * id is the board's, with the "hl-" prefix still on it.
 */
export async function armenianMatchDetailHighlightly(id: string): Promise<LiveMatchDetail | null> {
  const matchId = id.replace(/^hl-/, "");
  if (!/^\d+$/.test(matchId)) return null;

  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB?: D1Database }).DB;
  const cacheKey = `highlightly:v1:match:${matchId}`;
  if (db) {
    await db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    if (row?.payload) {
      try {
        const cached = JSON.parse(row.payload) as LiveMatchDetail;
        const done = cached.match?.status === "Ավարտված";
        const ttl = done ? 24 * 3600_000 : 8 * 60_000;
        if (Date.now() - row.savedAt < ttl) return cached;
      } catch { /* refetch */ }
    }
  }

  const data = await highlightly<HighlightlyMatch[] | { data?: HighlightlyMatch[] }>(`/matches/${matchId}`);
  const rows = Array.isArray(data) ? data : data?.data;
  const m = Array.isArray(rows) ? rows[0] : undefined;
  if (!m) return null;

  const kickoff = m.date ? new Date(m.date) : null;
  const { status, isLive, finished } = readStatus(m.state, kickoff);
  const score = readScore(m.state?.score);
  const home = armenianTeamName(m.homeTeam?.name ?? "");
  const away = armenianTeamName(m.awayTeam?.name ?? "");

  // Before kick-off there are no lineups - measured, eleven minutes before
  // one - so that request is not spent.
  const lineupData = isLive || finished
    ? await highlightly<{ homeTeam?: HighlightlySide2; awayTeam?: HighlightlySide2 }>(`/lineups/${matchId}`)
    : null;
  const lineups = lineupData
    ? [readLineup(lineupData.homeTeam, home), readLineup(lineupData.awayTeam, away)]
        .filter((l) => l.starters.length > 0 || l.substitutes.length > 0)
    : [];

  const detail: LiveMatchDetail = {
    match: {
      id, status, competition: "Հայաստանի Պրեմիեր լիգա",
      home, away,
      homeId: ARMENIAN_CLUB_IDS[home] ?? null,
      awayId: ARMENIAN_CLUB_IDS[away] ?? null,
      homeLogo: m.homeTeam?.logo ?? null,
      awayLogo: m.awayTeam?.logo ?? null,
      homeScore: isLive || finished ? score.home : null,
      awayScore: isLive || finished ? score.away : null,
      isLive,
    },
    venue: str(pick(m.venue, "name")),
    referee: str(pick(m.referee, "name")),
    events: readEvents(m.events, { homeName: home, awayName: away, homeId: str(m.homeTeam?.id), awayId: str(m.awayTeam?.id) }),
    lineups,
    statistics: [],
    h2h: [],
    prediction: null,
    standings: await armenianStandingsHighlightly(),
    // No /top-scorers at this provider in any spelling - 404, measured.
    // The tab hides itself.
    topScorers: null,
    injuries: [],
    formGuide: [],
    statRows: readStatRows(m.statistics),
  };

  if (db) {
    await db.prepare("INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0")
      .bind(cacheKey, JSON.stringify(detail), Date.now()).run();
  }
  return detail;
}
