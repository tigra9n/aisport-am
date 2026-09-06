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
  // v4 on 6 September, when the club-name rules changed. The cached payload
  // holds rows that were already translated, so a corrected spelling does not
  // reach a reader until the cache expires - Տոտտենհամ sat on the board for
  // half an hour after the fix shipped. Bumping the version is how this
  // codebase forces a refetch; the old rows fall out on their own.
  // v5 on 6 September, when the Armenian table moved to Highlightly. The
  // stored row holds the old five-row one and would sit there for six
  // hours, which is the whole point of this key being versioned.
  const cacheKey = `apifootball:v5:standings:${leagueId}:${season}`;

  if (db) {
    await ensureCacheTable(db);
    const row = await db.prepare("SELECT payload,saved_at AS savedAt FROM api_cache WHERE cache_key=?").bind(cacheKey).first<{ payload: string; savedAt: number }>();
    // Half an hour for the leagues ESPN serves, which costs nothing, and six
    // for Armenia, which is the one that reaches a paid provider on a free
    // plan of a hundred requests a day. Half an hour would spend forty-eight
    // of them on a table that only changes when a match finishes, and the
    // live board already carries the match while it is being played.
    const ttlMs = (code === "ARM" ? 6 * 60 : 30) * 60 * 1000;
    if (row?.savedAt && Date.now() - row.savedAt < ttlMs) {
      try {
        const rows = JSON.parse(row.payload) as StandingRow[];
        if (rows.length) return { rows, demo: false };
      } catch { /* fall through to refetch */ }
    }
  }

  // ESPN first, for every league it has.
  //
  // It is free and it answers this Worker in about 140ms - measured from
  // the deployed site, not from a runner, because site.api.espn.com refuses
  // Cloudflare's addresses while site.web.api.espn.com does not. The table
  // it returns is the same table: twenty teams, played, won, drawn, lost,
  // goal difference, points.
  //
  // Armenia is the exception and stays on the paid provider: ESPN's own
  // list has 218 soccer leagues and the Armenian Premier League is not one
  // of them. So ESPN_SLUG_BY_CODE has no ARM entry, espnStandings returns
  // null for it, and this falls through untouched.
  //
  // On failure it also falls through rather than showing an empty table.
  // A free source is worth having; it is not worth a blank league page.
  try {
    const { espnStandings, armenianStandings } = await import("./espn");
    // Armenia has no ESPN league. Highlightly does, and it is the only free
    // source measured against the league's own standings that got them
    // right: eleven of twelve exactly, the twelfth a naming alias on our
    // side. TheSportsDB stays behind it - its summary returns five rows of
    // twelve, which the floor below rejects, and that is the honest
    // behaviour when the good source is down.
    const rows = code === "ARM"
      ? (await (async () => {
          const { armenianStandingsHighlightly } = await import("./highlightly");
          return await armenianStandingsHighlightly();
        })()) ?? await armenianStandings()
      : await espnStandings(code);
    // A short table is not a table. The Armenian Premier League has ten
    // clubs and plays five matches a week; TheSportsDB's free key answers it
    // with exactly five rows - measured twice on 6 September, Noah down to
    // Ararat-Armenia and nothing below - so the site was showing precisely
    // half a league, and five rows read as success here, so it never reached
    // the source underneath. The Armenian table is the one this site exists
    // for.
    //
    // Eight rather than ten: a floor, not a headcount. A club that withdraws
    // mid-season, or one the provider spells differently, should not blank
    // the table - but half of it should never pass again.
    const enough = code === "ARM" ? 8 : 1;
    if (rows && rows.length >= enough) {
      if (db) {
        await db.prepare("INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0")
          .bind(cacheKey, JSON.stringify(rows), Date.now()).run();
      }
      return { rows, demo: false };
    }
  } catch { /* the paid provider below is the fallback */ }

  try {
    const response = await fetch(`https://v3.football.api-sports.io/standings?league=${leagueId}&season=${season}`, {
      headers: { "x-apisports-key": key, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`http ${response.status}`);
    const data = await response.json() as ApiFootballStandingsResponse;
    // Most leagues return a single flat table in standings[0]. US-style
    // leagues (MLS confirmed) split into multiple groups instead (Eastern
    // Conference, Western Conference) - taking only standings[0] silently
    // dropped half the league. Combine both into one table: Eastern block
    // first, then Western, each sorted by points/goal difference and each
    // restarting its own 1..N rank (matches how MLS itself displays it -
    // two independent conference tables, not one continuous 1-30 ranking).
    const groups = data.response?.[0]?.league?.standings ?? [];
    if (!groups.length || !groups[0]?.length) throw new Error("empty table");
    const groupPriority = (group?: string | null) => {
      if (!group) return 0;
      if (group.includes("Eastern")) return 0;
      if (group.includes("Western")) return 1;
      return 0;
    };
    const orderedGroups = [...groups].sort((a, b) => groupPriority(a[0]?.group) - groupPriority(b[0]?.group));
    const rows: StandingRow[] = orderedGroups.flatMap((group) => {
      const sortedGroup = [...group].sort((a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff);
      return sortedGroup.map((row, index) => ({
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
    });
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
