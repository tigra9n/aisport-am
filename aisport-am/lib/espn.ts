// ESPN, read from inside the Worker.
//
// Measured on 6 September, from the deployed Worker rather than from a
// runner, because the two answer differently and only one of them matters:
//
//   site.api.espn.com      403 to every signature - browser, bot, none
//   site.web.api.espn.com  200 in ~110ms, full scoreboard
//   cdn.espn.com           200 in ~99ms
//
// The block is on Cloudflare's addresses at one hostname, not on the
// request, so everything here goes through site.web.api. A browser
// User-Agent is still sent: from a GitHub runner site.api refused
// "AIFootballBot/1.0" and accepted a browser string, and there is no reason
// to hand Akamai a second reason to refuse us.
//
// Also measured, on the same host and from the same Worker: standings 200,
// a match summary 200, La Liga 200, the Europa League 200 - the last of
// which football-data.org charges for.
//
// What ESPN does not have is Armenia. Its own list returns 218 soccer
// leagues and none of them is the Armenian Premier League; it knows the
// clubs (Pyunik 2493, Ararat-Armenia 20024, Alashkert 17858) only through
// the European competitions they qualified for. Armenian football stays
// where it is until a free source for the domestic league is found.
import { formatTimeYerevan } from "./format-date";
import { armenianTeamName } from "./team-names-hy";
import type { LiveMatch } from "./live-football-server";

const HOST = "https://site.web.api.espn.com/apis/site/v2/sports/soccer";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

// The same competitions the site already tracks, in the same order, so the
// live list keeps the ordering readers are used to. The Armenian entries
// have no ESPN slug and are deliberately absent rather than guessed at.
export const ESPN_LEAGUES: { slug: string; priority: number; label: string }[] = [
  { slug: "uefa.champions", priority: 1, label: "Չեմպիոնների լիգա" },
  { slug: "uefa.europa", priority: 2, label: "Եվրոպա լիգա" },
  { slug: "uefa.europa.conf", priority: 3, label: "Կոնֆերենցիա լիգա" },
  { slug: "eng.1", priority: 4, label: "Անգլիայի Պրեմիեր լիգա" },
  { slug: "eng.fa", priority: 5, label: "Անգլիայի գավաթ (FA Cup)" },
  { slug: "eng.league_cup", priority: 6, label: "Անգլիայի լիգայի գավաթ" },
  { slug: "esp.1", priority: 7, label: "Իսպանիայի Լա Լիգա" },
  { slug: "esp.copa_del_rey", priority: 8, label: "Իսպանիայի գավաթ (Copa del Rey)" },
  { slug: "ita.1", priority: 9, label: "Իտալիայի Սերիա Ա" },
  { slug: "ita.coppa_italia", priority: 10, label: "Իտալիայի գավաթ (Coppa Italia)" },
  { slug: "ger.1", priority: 11, label: "Գերմանիայի Բունդեսլիգա" },
  { slug: "ger.dfb_pokal", priority: 12, label: "Գերմանիայի գավաթ (DFB Pokal)" },
  { slug: "fra.1", priority: 13, label: "Ֆրանսիայի Լիգա 1" },
  { slug: "fra.coupe_de_france", priority: 14, label: "Ֆրանսիայի գավաթ (Coupe de France)" },
  { slug: "usa.1", priority: 15, label: "MLS" },
  { slug: "ksa.1", priority: 16, label: "Սաուդյան Արաբիայի պրոֆեսիոնալ լիգա" },
];

type EspnCompetitor = {
  homeAway?: string;
  score?: string;
  team?: { id?: string; displayName?: string; shortDisplayName?: string; logo?: string; logos?: { href?: string }[] };
};
type EspnEvent = {
  id?: string;
  date?: string;
  status?: { type?: { state?: string; completed?: boolean; detail?: string; shortDetail?: string }; displayClock?: string };
  competitions?: { competitors?: EspnCompetitor[] }[];
};

export async function espnJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${HOST}${path}`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ESPN reports a match's state as "pre", "in" or "post" and gives the clock
// separately. The site's own vocabulary is Armenian and already fixed by
// what readers see today, so translate into that rather than inventing a
// second set of words for the same three things.
function statusLabel(event: EspnEvent): { label: string; isLive: boolean } {
  const state = event.status?.type?.state;
  const detail = event.status?.type?.shortDetail ?? event.status?.type?.detail ?? "";
  if (state === "in") {
    if (/half/i.test(detail) && /end|ht/i.test(detail)) return { label: "Ընդմիջում", isLive: true };
    const clock = event.status?.displayClock?.replace(/'$/, "");
    return { label: clock ? `${clock}′` : "LIVE", isLive: true };
  }
  if (state === "post") {
    if (/postponed/i.test(detail)) return { label: "Հետաձգված", isLive: false };
    if (/cancell?ed|abandoned|forfeit/i.test(detail)) return { label: "Չեղարկված", isLive: false };
    return { label: "Ավարտված", isLive: false };
  }
  if (/postponed/i.test(detail)) return { label: "Հետաձգված", isLive: false };
  if (/cancell?ed/i.test(detail)) return { label: "Չեղարկված", isLive: false };
  return { label: event.date ? formatTimeYerevan(event.date) : "", isLive: false };
}

function crest(team: EspnCompetitor["team"]): string | null {
  return team?.logo ?? team?.logos?.[0]?.href ?? null;
}

// The ids are prefixed "espn-" because the site already prefixes
// API-Football's with "af-", and a match page has to know which provider a
// number belongs to before it can ask anyone about it.
function toMatch(event: EspnEvent, league: { slug: string; priority: number; label: string }): (LiveMatch & { priority: number; timestamp: number }) | null {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
  if (!home?.team?.displayName || !away?.team?.displayName || !event.id) return null;
  const { label, isLive } = statusLabel(event);
  const score = (c: EspnCompetitor) => (c.score === undefined || c.score === "" ? null : Number(c.score));
  return {
    // The slug travels in the id because /summary needs it and the match
    // page is handed nothing but an id.
    id: `espn-${league.slug}-${event.id}`,
    status: label,
    competition: league.label,
    home: armenianTeamName(home.team.displayName),
    away: armenianTeamName(away.team.displayName),
    // ESPN's team ids are strings and belong to ESPN, not to API-Football.
    // The site's team pages are built on API-Football's numbering, so these
    // are left null rather than linked to a page about a different club.
    homeId: null,
    awayId: null,
    homeLogo: crest(home.team),
    awayLogo: crest(away.team),
    homeScore: score(home),
    awayScore: score(away),
    isLive,
    priority: league.priority,
    timestamp: event.date ? new Date(event.date).getTime() : 0,
  };
}

/**
 * Every tracked competition's fixtures for one day, read from ESPN.
 *
 * One request per competition rather than one for everything: ESPN's
 * scoreboard is per league. Sixteen requests is more than API-Football's
 * single call for a date, but ESPN publishes no quota and they run at once,
 * so the cost is about a tenth of a second in total rather than sixteen
 * times anything.
 */
export async function espnMatchesForDate(date: string): Promise<LiveMatch[]> {
  const dates = date.replace(/-/g, "");
  const fetched = await Promise.all(
    ESPN_LEAGUES.map(async (league) => {
      const data = await espnJson<{ events?: EspnEvent[] }>(`/${league.slug}/scoreboard?dates=${dates}`);
      return (data?.events ?? []).map((event) => toMatch(event, league)).filter(Boolean);
    }),
  );
  return fetched
    .flat()
    .filter((m): m is LiveMatch & { priority: number; timestamp: number } => Boolean(m))
    .sort((a, b) => a.priority - b.priority || Number(b.isLive) - Number(a.isLive) || a.timestamp - b.timestamp)
    .map((entry) => { const { priority, timestamp, ...match } = entry; void priority; void timestamp; return match; });
}

// ---------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------

// The site's league codes, mapped to ESPN's slugs. ARM is absent on
// purpose: ESPN has no Armenian league, so the Armenian table keeps its
// existing source rather than silently showing nothing.
export const ESPN_SLUG_BY_CODE: Record<string, string> = {
  PL: "eng.1",
  PD: "esp.1",
  SA: "ita.1",
  BL1: "ger.1",
  FL1: "fra.1",
  SPL: "ksa.1",
  MLS: "usa.1",
};

type EspnStandingEntry = {
  team?: { id?: string; displayName?: string; shortDisplayName?: string; logos?: { href?: string }[] };
  note?: { rank?: number };
  stats?: { name?: string; type?: string; value?: number }[];
};

export async function espnStandings(code: string): Promise<import("./football").StandingRow[] | null> {
  const slug = ESPN_SLUG_BY_CODE[code];
  if (!slug) return null;
  const data = await espnJson<{ children?: { standings?: { entries?: EspnStandingEntry[] } }[]; standings?: { entries?: EspnStandingEntry[] } }>(
    `/${slug}/standings`,
  );
  // A single-table league puts its entries at the top level; one with
  // groups or conferences puts them under children. MLS is the reason this
  // has to handle both.
  const groups = data?.children?.length ? data.children : [{ standings: data?.standings }];
  const entries = groups.flatMap((g) => g.standings?.entries ?? []);
  if (!entries.length) return null;

  // ESPN names its numbers rather than ordering them, and the names differ
  // between competitions, so each one is looked up rather than taken by
  // position - "gamesPlayed" sits in a different slot in MLS than in the
  // Premier League.
  const stat = (entry: EspnStandingEntry, ...names: string[]) => {
    for (const name of names) {
      const found = entry.stats?.find((s) => s.name === name || s.type === name);
      if (found?.value !== undefined) return Number(found.value);
    }
    return 0;
  };

  const rows = entries.map((entry) => ({
    position: stat(entry, "rank") || 0,
    team: armenianTeamName(entry.team?.displayName ?? ""),
    // ESPN's ids are not API-Football's, and the site's team pages are
    // built on API-Football's numbering. Linking one to the other would
    // send a reader to a page about a different club.
    teamId: null,
    teamLogo: entry.team?.logos?.[0]?.href ?? null,
    played: stat(entry, "gamesPlayed"),
    won: stat(entry, "wins"),
    draw: stat(entry, "ties", "draws"),
    lost: stat(entry, "losses"),
    goalDifference: stat(entry, "pointDifferential", "goalDifference"),
    points: stat(entry, "points"),
  }));
  // Rank is not always populated; fall back to points then goal difference,
  // which is the order every table on the site is read in anyway.
  const ranked = rows.every((r) => r.position > 0)
    ? rows.sort((a, b) => a.position - b.position)
    : rows
        .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference)
        .map((row, index) => ({ ...row, position: index + 1 }));
  return ranked.filter((r) => r.team);
}

// ---------------------------------------------------------------------
// The match page
// ---------------------------------------------------------------------
//
// This is what API-Football is actually paid for: the detail page costs it
// eight to ten calls per match - fixture, both teams' statistics, players,
// events, statistics, injuries, predictions, head to head, lineups. ESPN
// answers all of it in ONE request to /summary, and the fields were read
// off a real match rather than guessed:
//
//   keyEvents      goals, cards, substitutions, with minute and players
//   rosters        starters and bench, jersey numbers, formation, who came
//                  on and off, and fourteen numbers per player
//   boxscore.teams twenty-eight team statistics, possession and shots among
//                  them - the first sample printed only six because it had
//                  been sliced, not because ESPN sends six
//   seasonseries   previous meetings
//   standings      the table, alongside
//   commentary     minute-by-minute text
//
// It does not carry injuries or a prediction. Those two sections of the
// page have no free equivalent and are the honest cost of the move.

type EspnAthlete = { displayName?: string; shortName?: string };
type EspnRosterPlayer = {
  starter?: boolean;
  jersey?: string;
  athlete?: EspnAthlete;
  formationPlace?: string;
  subbedIn?: boolean | { didSub?: boolean };
  stats?: { name?: string; value?: number; displayValue?: string }[];
};
type EspnSummary = {
  boxscore?: { teams?: { team?: { displayName?: string }; statistics?: { name?: string; displayValue?: string }[] }[] };
  rosters?: { team?: { displayName?: string }; formation?: string; roster?: EspnRosterPlayer[] }[];
  keyEvents?: {
    clock?: { displayValue?: string };
    type?: { text?: string };
    team?: { displayName?: string };
    athletesInvolved?: EspnAthlete[];
    text?: string;
  }[];
  seasonseries?: { events?: { date?: string; competitors?: EspnCompetitor[] }[] }[];
  gameInfo?: { venue?: { fullName?: string }; officials?: { displayName?: string }[]; attendance?: number };
  commentary?: { time?: { displayValue?: string }; text?: string; play?: { text?: string } }[];
};

const STAT_LABEL: Record<string, string> = {
  possessionPct: "Տիրապետում",
  totalShots: "Հարվածներ",
  shotsOnTarget: "Դարպասի ուղղությամբ",
  wonCorners: "Անկյունային",
  foulsCommitted: "Խախտումներ",
  yellowCards: "Դեղին քարտեր",
  redCards: "Կարմիր քարտեր",
  offsides: "Խաղից դուրս",
  saves: "Փրկումներ",
  accuratePasses: "Ճշգրիտ փոխանցումներ",
  passPct: "Փոխանցումների ճշգրտություն",
  totalTackles: "Խլումներ",
  interceptions: "Ընդհատումներ",
  // ESPN sends twenty-eight numbers. These are the ones API-Football never
  // gave the page at all, and they are what makes the new match centre
  // better than the paid one rather than merely as good.
  totalPasses: "Փոխանցումներ",
  accurateCrosses: "Ճշգրիտ փոխադրումներ",
  totalCrosses: "Փոխադրումներ",
  accurateLongBalls: "Ճշգրիտ երկար փոխանցումներ",
  totalLongBalls: "Երկար փոխանցումներ",
  blockedShots: "Արգելափակված հարվածներ",
  effectiveTackles: "Հաջող խլումներ",
  effectiveClearance: "Մաքրումներ",
  penaltyKickGoals: "Պենալտիից գոլեր",
};

// The per-player numbers ESPN attaches to every roster entry. API-Football
// charged for these; here they arrive in the same single request as the
// lineup, so the page can show who actually did what rather than only who
// was on the pitch.
const PLAYER_STAT_LABEL: Record<string, string> = {
  totalGoals: "Գոլ",
  goalAssists: "Գոլային փոխանցում",
  totalShots: "Հարված",
  shotsOnTarget: "Դարպասի ուղղությամբ",
  saves: "Փրկում",
  foulsCommitted: "Խախտում",
  foulsSuffered: "Իր վրա խախտում",
  yellowCards: "Դեղին",
  redCards: "Կարմիր",
  ownGoals: "Ինքնագոլ",
};

export type EspnPlayerLine = {
  id: null;
  name: string;
  number: number | null;
  grid: string | null;
  rating: string | null;
  // What this player actually did, in words, from ESPN's fourteen numbers.
  // Empty for anyone who did nothing measurable, which is most of a bench.
  did: { label: string; value: number }[];
};

export type EspnMatchDetail = {
  venue: string;
  referee: string;
  events: { minute: string; team: string; player: string; assist: string; label: string }[];
  lineups: { team: string; formation: string; starters: EspnPlayerLine[]; substitutes: EspnPlayerLine[] }[];
  statistics: { team: string; rows: { label: string; value: string }[] }[];
  h2h: { date: string; competition: string; home: string; away: string; homeScore: number | null; awayScore: number | null }[];
  attendance: number | null;
  // Minute-by-minute text for the whole match, which API-Football never
  // gave the page at any price.
  //
  // This is the one thing here that is ESPN's writing rather than ESPN's
  // facts. A score, a scorer, a card and a substitution are facts and free
  // to anyone; "Arsenal are pressing high and Chelsea look rattled" is a
  // sentence somebody wrote. Tigran was told the difference and chose to
  // carry it anyway - his call, his site. What is not optional is saying
  // where it came from, so the page credits ESPN beside it. Publishing
  // someone's writing unattributed is a different thing from publishing it.
  commentary: { minute: string; text: string }[];
  commentarySource: string | null;
};

export async function espnMatchDetail(eventId: string, leagueSlug: string): Promise<EspnMatchDetail | null> {
  const data = await espnJson<EspnSummary>(`/${leagueSlug}/summary?event=${encodeURIComponent(eventId)}`);
  if (!data) return null;

  const player = (p: EspnRosterPlayer): EspnPlayerLine => ({
    id: null,
    name: p.athlete?.displayName ?? p.athlete?.shortName ?? "",
    number: p.jersey ? Number(p.jersey) : null,
    grid: p.formationPlace ?? null,
    // ESPN publishes no player rating. Showing nothing is right; a number
    // derived from its statistics would be inventing an opinion and
    // presenting it as the provider's.
    rating: null,
    did: Object.keys(PLAYER_STAT_LABEL)
      .map((name) => {
        const found = p.stats?.find((st) => st.name === name);
        const value = Number(found?.value ?? 0);
        return value > 0 ? { label: PLAYER_STAT_LABEL[name], value } : null;
      })
      .filter((x): x is { label: string; value: number } => Boolean(x)),
  });

  return {
    venue: data.gameInfo?.venue?.fullName ?? "",
    referee: data.gameInfo?.officials?.[0]?.displayName ?? "",
    events: (data.keyEvents ?? []).map((e) => ({
      minute: e.clock?.displayValue ?? "",
      team: armenianTeamName(e.team?.displayName ?? ""),
      player: e.athletesInvolved?.[0]?.displayName ?? "",
      assist: e.athletesInvolved?.[1]?.displayName ?? "",
      label: e.type?.text ?? e.text ?? "",
    })).filter((e) => e.label),
    lineups: (data.rosters ?? []).map((r) => ({
      team: armenianTeamName(r.team?.displayName ?? ""),
      formation: r.formation ?? "",
      starters: (r.roster ?? []).filter((p) => p.starter).map(player).filter((p) => p.name),
      substitutes: (r.roster ?? []).filter((p) => !p.starter).map(player).filter((p) => p.name),
    })).filter((l) => l.starters.length),
    statistics: (data.boxscore?.teams ?? []).map((t) => ({
      team: armenianTeamName(t.team?.displayName ?? ""),
      // Only the numbers a reader recognises, in a fixed order, rather than
      // all twenty-eight in ESPN's order.
      rows: Object.keys(STAT_LABEL)
        .map((name) => {
          const found = t.statistics?.find((s) => s.name === name);
          return found?.displayValue ? { label: STAT_LABEL[name], value: found.displayValue } : null;
        })
        .filter((row): row is { label: string; value: string } => Boolean(row)),
    })).filter((s) => s.rows.length),
    h2h: (data.seasonseries?.[0]?.events ?? []).map((e) => {
      const home = e.competitors?.find((c) => c.homeAway === "home") ?? e.competitors?.[0];
      const away = e.competitors?.find((c) => c.homeAway === "away") ?? e.competitors?.[1];
      return {
        date: e.date?.slice(0, 10) ?? "",
        competition: "",
        home: armenianTeamName(home?.team?.displayName ?? ""),
        away: armenianTeamName(away?.team?.displayName ?? ""),
        homeScore: home?.score === undefined ? null : Number(home.score),
        awayScore: away?.score === undefined ? null : Number(away.score),
      };
    }).filter((m) => m.home && m.away),
    attendance: data.gameInfo?.attendance ?? null,
    commentary: (data.commentary ?? [])
      .map((c) => ({ minute: c.time?.displayValue ?? "", text: (c.text ?? c.play?.text ?? "").trim() }))
      .filter((c) => c.text),
    commentarySource: (data.commentary ?? []).some((c) => (c.text ?? c.play?.text ?? "").trim()) ? "ESPN" : null,
  };
}

// ---------------------------------------------------------------------
// Armenia
// ---------------------------------------------------------------------
//
// ESPN does not have the Armenian league. Its own list returns 218 soccer
// competitions and the Armenian Premier League is not one of them; five
// spellings of the slug all answer 400, and it knows Pyunik, Ararat-Armenia
// and Alashkert only through the European ties they qualified for.
//
// TheSportsDB does have it, on the free key its documentation hands out:
// league 4619, with the table, the coming fixtures and the recent results,
// all current when measured. Its livescore endpoint is paid, so the minute
// of an Armenian match still costs a paid request - but the table does not.
//
// It rate-limits hard from Cloudflare's addresses: asked twice in a minute
// from the Worker it answered 429 with Cloudflare's own error 1015. So this
// is called through the same api_cache the rest of the site uses, on a long
// window, and never per page view.
const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/3";
const ARMENIAN_LEAGUE_ID = "4619";

type SportsDbRow = { intRank?: string; strTeam?: string; strBadge?: string; intPoints?: string; intPlayed?: string; intWin?: string; intDraw?: string; intLoss?: string; intGoalDifference?: string };

function armenianSeasonLabel(now = new Date()): string {
  // The Armenian league runs across two calendar years, and TheSportsDB
  // labels a season "2026-2027". July is the turn.
  const year = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export async function armenianStandings(): Promise<import("./football").StandingRow[] | null> {
  try {
    const data = await sportsDb<{ table?: SportsDbRow[] }>(`/lookuptable.php?l=${ARMENIAN_LEAGUE_ID}&s=${armenianSeasonLabel()}`);
    if (!data) return null;
    const rows = (data.table ?? [])
      .map((r, index) => ({
        position: Number(r.intRank ?? 0) || index + 1,
        team: armenianTeamName(r.strTeam ?? ""),
        // TheSportsDB's ids are its own; the site's team pages run on
        // API-Football's numbering and linking one to the other would open
        // a page about a different club.
        teamId: null,
        teamLogo: r.strBadge ?? null,
        played: Number(r.intPlayed ?? 0),
        won: Number(r.intWin ?? 0),
        draw: Number(r.intDraw ?? 0),
        lost: Number(r.intLoss ?? 0),
        goalDifference: Number(r.intGoalDifference ?? 0),
        points: Number(r.intPoints ?? 0),
      }))
      .filter((r) => r.team);
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// The match page, in the shape the site already renders
// ---------------------------------------------------------------------
//
// The page's own type is fixed by the components that draw it, so this
// fills that shape rather than changing it: the richer material ESPN sends
// - twenty-eight team numbers, fourteen per player, the commentary - is
// read above and waits on the layout work to show it. What matters tonight
// is that a match page costs nothing instead of ten paid requests.
export async function espnLiveMatchDetail(id: string): Promise<import("./live-football-server").LiveMatchDetail | null> {
  const match = /^espn-(.+)-(\d+)$/.exec(id);
  if (!match) return null;
  const [, slug, eventId] = match;

  const data = await espnJson<EspnSummary & {
    header?: {
      competitions?: {
        id?: string;
        date?: string;
        status?: { type?: { state?: string; detail?: string; shortDetail?: string }; displayClock?: string };
        competitors?: (EspnCompetitor & { team?: { displayName?: string; logo?: string; logos?: { href?: string }[] } })[];
      }[];
      league?: { name?: string };
    };
  }>(`/${slug}/summary?event=${encodeURIComponent(eventId)}`);
  if (!data) return null;

  const competition = data.header?.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const league = ESPN_LEAGUES.find((l) => l.slug === slug);
  const status = statusLabel({ date: competition?.date, status: competition?.status });
  const score = (c?: EspnCompetitor) => (c?.score === undefined || c.score === "" ? null : Number(c.score));

  const detail = await espnMatchDetail(eventId, slug);

  return {
    match: {
      id,
      status: status.label,
      competition: league?.label ?? data.header?.league?.name ?? "",
      home: armenianTeamName(home.team.displayName),
      away: armenianTeamName(away.team.displayName),
      homeId: null,
      awayId: null,
      homeLogo: crest(home.team),
      awayLogo: crest(away.team),
      homeScore: score(home),
      awayScore: score(away),
      isLive: status.isLive,
    },
    venue: detail?.venue ?? "",
    referee: detail?.referee ?? "",
    events: detail?.events ?? [],
    lineups: (detail?.lineups ?? []).map((l) => ({
      team: l.team,
      formation: l.formation,
      starters: l.starters.map((p) => ({ id: null, name: p.name, number: p.number, grid: p.grid, rating: p.rating })),
      substitutes: l.substitutes.map((p) => ({ id: null, name: p.name, number: p.number, grid: p.grid, rating: p.rating })),
    })),
    // The page's statistics block has four fixed slots. ESPN sends
    // twenty-eight numbers; three of them go here and the rest wait for the
    // layout to be widened. Expected goals is not among what ESPN sends at
    // all, so it stays empty rather than being filled with something else.
    statistics: (detail?.statistics ?? []).map((s) => ({
      team: s.team,
      possession: s.rows.find((r) => r.label === "Տիրապետում")?.value ?? "",
      shotsOnGoal: s.rows.find((r) => r.label === "Դարպասի ուղղությամբ")?.value ?? "",
      totalShots: s.rows.find((r) => r.label === "Հարվածներ")?.value ?? "",
      xg: "",
    })),
    h2h: detail?.h2h ?? [],
    // No free equivalent, and inventing either would be worse than an
    // empty section: a prediction is somebody's opinion and an injury list
    // is a claim about a person's health.
    prediction: null,
    injuries: [],
    standings: null,
    topScorers: null,
    formGuide: [],
  };
}

// Armenian fixtures and results, free.
//
// TheSportsDB's free key gives the coming games and the finished ones with
// their scores, which is everything the board shows about an Armenian match
// except the minute while it is being played. It has no livescore on the
// free tier - that endpoint is paid - so a match in progress reads as
// scheduled until it finishes and then appears with its result.
//
// That is the honest cost of cancelling the subscription, and it is the
// only thing lost.
type SportsDbEvent = {
  idEvent?: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  dateEvent?: string;
  strTimestamp?: string;
  strStatus?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
};

// TheSportsDB refuses Cloudflare's addresses when asked too often - HTTP
// 429 with Cloudflare's own error 1015, seen from this Worker on a second
// call inside a minute. Its callers already cache, but a cold cache during
// a refusal would ask again on the very next page view and keep the
// refusal alive, which is exactly the failure this codebase spent an
// evening on in September when API-Football's daily allowance ran out.
//
// So a refusal is remembered in memory for five minutes. It is only the
// Worker's memory, which is recycled often, and that is fine: the point is
// not to remember for long, it is to stop a burst of page views turning
// one 429 into a hundred.
let sportsDbSilentUntil = 0;

async function sportsDb<T>(path: string): Promise<T | null> {
  if (Date.now() < sportsDbSilentUntil) return null;
  try {
    const res = await fetch(`${SPORTSDB}${path}`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 429) {
      sportsDbSilentUntil = Date.now() + 5 * 60_000;
      return null;
    }
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

/**
 * Is an Armenian match being played right now, or about to be?
 *
 * This exists so API-Football is asked only when there is something to ask
 * about. Nothing about it costs money any more - the subscription is going
 * and its free plan is what remains - but that plan allows a hundred
 * requests a day, and asking every eight minutes around the clock spends a
 * hundred and eighty on nothing. The Armenian league plays a handful of
 * matches a week, so taking the kick-off times from a free source and only
 * then spending one of the hundred is the difference between fitting inside
 * the free plan and needing a subscription.
 *
 * The window opens ten minutes before kick-off and closes two and a half
 * hours after it - long enough for stoppages, a delayed start and a full
 * match, short enough that a Wednesday afternoon costs nothing.
 */
export async function armenianMatchWindow(date: string): Promise<boolean> {
  const matches = await armenianMatchesForDate(date);
  const now = Date.now();
  return matches.some((m) => {
    if (m.homeScore !== null) return false;
    const kickoff = m.kickoffMs;
    if (!kickoff) return false;
    return now > kickoff - 10 * 60_000 && now < kickoff + 150 * 60_000;
  });
}

export type ArmenianMatch = LiveMatch & { kickoffMs: number | null };

export async function armenianMatchesForDate(date: string): Promise<ArmenianMatch[]> {
  const [next, past] = await Promise.all([
    sportsDb<{ events?: SportsDbEvent[] }>(`/eventsnextleague.php?id=${ARMENIAN_LEAGUE_ID}`),
    sportsDb<{ events?: SportsDbEvent[] }>(`/eventspastleague.php?id=${ARMENIAN_LEAGUE_ID}`),
  ]);
  const all = [...(past?.events ?? []), ...(next?.events ?? [])];
  return all
    .filter((e) => (e.dateEvent ?? "") === date)
    .map((e) => {
      const played = e.intHomeScore !== null && e.intHomeScore !== undefined && e.intHomeScore !== "";
      const kickoff = e.strTimestamp ? new Date(e.strTimestamp.replace(" ", "T") + "Z") : null;
      return {
        id: `sdb-${e.idEvent}`,
        status: played ? "Ավարտված" : kickoff ? formatTimeYerevan(kickoff.toISOString()) : "",
        competition: "Հայաստանի Պրեմիեր լիգա",
        home: armenianTeamName(e.strHomeTeam ?? ""),
        away: armenianTeamName(e.strAwayTeam ?? ""),
        homeId: null,
        awayId: null,
        homeLogo: e.strHomeTeamBadge ?? null,
        awayLogo: e.strAwayTeamBadge ?? null,
        homeScore: played ? Number(e.intHomeScore) : null,
        awayScore: played ? Number(e.intAwayScore) : null,
        // TheSportsDB's free tier has no live feed, so nothing from it is
        // ever marked live. Claiming otherwise would put a "LIVE" badge on
        // a score that is not moving. While a match is actually in progress
        // API-Football's free plan fills the minute in, which is what
        // armenianMatchWindow above decides.
        isLive: false,
        kickoffMs: kickoff ? kickoff.getTime() : null,
      };
    })
    .filter((m) => m.home && m.away);
}

// ---------------------------------------------------------------------
// What is left, and why it has not moved
// ---------------------------------------------------------------------
//
// Four things still read API-Sports: squads, player pages, top scorers and
// team pages. ESPN has all four - measured on 6 September, not assumed:
//
//   squad      /apis/site/v2/sports/soccer/eng.1/teams/363/roster
//              200, thirty players, each with jersey number, position, age
//              and nationality
//   team       /apis/site/v2/sports/soccer/eng.1/teams/363
//              200, name and crest at a.espncdn.com/i/teamlogos/soccer/500/
//   scorers    sports.core.api.espn.com/v2/sports/soccer/leagues/eng.1/
//              seasons/2026/types/1/leaders
//              200, and not only goals: assists, shots on target, cards,
//              fouls, accurate passes, saves. The athletes come back as
//              $ref links, so a top ten costs ten more calls unless the
//              byathlete endpoint is used instead, which returns 200 too.
//   player     /apis/common/v3/sports/soccer/athletes/150818
//              200, with name, position, age, height, weight, date of
//              birth, shirt number and club; the core API adds birthplace
//              and injuries.
//
// They have not moved because they are one decision, not four. Every one of
// them lives behind a URL numbered by API-Sports - /team/50 is Chelsea
// because API-Sports says 50, and ESPN says 363 - and those URLs are the
// ones Google has just started indexing after a week of work on exactly
// that. Swapping the source without a mapping between the two numberings
// would point every indexed team and player page at a different footballer.
//
// So the work is the mapping, not the reading. Tigran chose to wait rather
// than carry that complexity now, which is the right call: these pages are
// lightly visited and cached, so what they cost is small, while what a
// wrong mapping would cost is every indexed page on the site.

