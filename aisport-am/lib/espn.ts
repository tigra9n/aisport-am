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
import { armenianPlayerName } from "./player-names-hy";
import { armenianCountry, armenianCompetition } from "./names-hy";
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
  return espnUrl<T>(`${HOST}${path}`);
}

// ESPN does not keep everything under one root. The scoreboard, the teams
// and a match summary are under /apis/site/v2/sports/soccer; the league
// tables are under /apis/v2/sports/soccer. Asking the first for a table
// returns HTTP 200 with an empty body - not an error, not a table - which
// is why espnStandings quietly returned nothing from the day it was
// written and every league page on this site was still being served by the
// paid provider without anyone noticing. It went unnoticed until that
// provider's free plan ran out of requests mid-evening and the Saudi and
// MLS tables went blank.
const STANDINGS_HOST = "https://site.web.api.espn.com/apis/v2/sports/soccer";

export async function espnUrl<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
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
    // ESPN's team ids are strings and belong to ESPN, not to API-Football,
    // so they travel under their own prefix. Left as ids the board would
    // link a reader to a page about a different club.
    homeId: null,
    awayId: null,
    homeKey: home.team.id ? espnKey(home.team.id) : null,
    awayKey: away.team.id ? espnKey(away.team.id) : null,
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
  // The European competitions, which the live board has always carried -
  // they are the first three entries of ESPN_LEAGUES - but which had no
  // table and no scoring chart, because this map is what those two read
  // and it only ever held the domestic leagues.
  CL: "uefa.champions",
  EL: "uefa.europa",
  ECL: "uefa.europa.conf",
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
  const data = await espnUrl<{ children?: { standings?: { entries?: EspnStandingEntry[] } }[]; standings?: { entries?: EspnStandingEntry[] } }>(
    `${STANDINGS_HOST}/${slug}/standings`,
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
    // ESPN's ids are not API-Football's, so they travel under their own
    // prefix rather than as a bare number that would send a reader to a
    // page about a different club. The team page reads both.
    teamId: null,
    teamKey: entry.team?.id ? espnKey(entry.team.id) : null,
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

type EspnAthlete = { id?: string; displayName?: string; shortName?: string };
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
    shortText?: string;
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

// What ESPN calls each thing that happens in a match. It sends these in
// English - "Goal", "Yellow Card", "Substitution" - and the page printed
// them as they came, so an Armenian match centre listed its goals in
// English. Keyed loosely, because ESPN writes the same event several ways
// ("Penalty - Scored", "Goal - Penalty") depending on the competition.
const EVENT_LABEL: [RegExp, string][] = [
  [/own\s*goal/i, "Ինքնագոլ"],
  [/penalty.*(scored|goal)|goal.*penalty/i, "Գոլ պենալտիից"],
  [/penalty.*(missed|saved)/i, "Չխփած պենալտի"],
  [/penalty/i, "Պենալտի"],
  [/goal/i, "Գոլ"],
  [/second\s*yellow|yellow\s*red/i, "Երկրորդ դեղին քարտ"],
  [/yellow/i, "Դեղին քարտ"],
  [/red\s*card/i, "Կարմիր քարտ"],
  [/substitut/i, "Փոխարինում"],
  [/var/i, "VAR"],
  [/half\s*time|halftime/i, "Ընդմիջում"],
  [/full\s*time|end\s*(of)?\s*(regular|match|game)?/i, "Խաղի ավարտ"],
  [/kick\s*off|start/i, "Խաղի սկիզբ"],
  [/corner/i, "Անկյունային"],
  [/offside/i, "Խաղից դուրս"],
  [/foul/i, "Խախտում"],
];

function eventLabel(text: string) {
  for (const [pattern, hy] of EVENT_LABEL) if (pattern.test(text)) return hy;
  return text;
}

// "Alexander Isak Goal" -> "Alexander Isak". ESPN puts the event's own word
// at the end of shortText, so removing it leaves the man. Anything that does
// not end that way is left alone rather than guessed at: a line reading
// "Second Half begins" has no footballer in it and must not produce one.
function scorerFrom(shortText: string | undefined, type: string | undefined): string | null {
  if (!shortText || !type) return null;
  const suffix = new RegExp(`\\s+${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (!suffix.test(shortText)) return null;
  const name = shortText.replace(suffix, "").trim();
  // A scoreline, a club, or a sentence is not a name. Two or three words,
  // each starting with a capital, is.
  const words = name.split(/\s+/);
  if (words.length < 2 || words.length > 4) return null;
  return words.every((w) => /^[\p{Lu}]/u.test(w)) ? name : null;
}

// "... Assisted by Cody Gakpo with a through ball." -> "Cody Gakpo".
function assistFrom(text: string | undefined): string | null {
  const found = text?.match(/Assisted by ([^.,]+?)(?: with | after |[.,]|$)/i);
  return found ? found[1].trim() : null;
}

export type EspnPlayerLine = {
  id: null;
  // ESPN's own athlete number, under the "espn-" prefix, so the lineup can
  // be the way into a player page. The two providers number footballers
  // differently and a bare number cannot say which is meant - the same
  // reason the standings carry teamKey beside teamId.
  key: string | null;
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
    key: p.athlete?.id ? espnKey(p.athlete.id) : null,
    // Armenian, like the rest of the page. The lineup is where a reader
    // meets most of these names.
    name: armenianPlayerName(p.athlete?.displayName ?? p.athlete?.shortName ?? ""),
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
      // MEASURED on the Ipswich-Liverpool summary: ESPN's keyEvents carry
      // no athletesInvolved at all for a goal, which is why the timeline
      // read "Գոլ" twice with nobody beside it for a match Isak scored both
      // of. The names are in the prose:
      //
      //   shortText  "Alexander Isak Goal"
      //   text       "Goal! Ipswich Town 0, Liverpool 1. Alexander Isak
      //               (Liverpool) right footed shot ... Assisted by Cody
      //               Gakpo with a through ball."
      //
      // shortText is the scorer and the event and nothing else, so it gives
      // the name; the assist only exists in the long text, after "Assisted
      // by". Armenian, like every other name on the page - the timeline was
      // the one place a footballer kept his English spelling, standing next
      // to an Armenian club and an Armenian label.
      player: armenianPlayerName(e.athletesInvolved?.[0]?.displayName ?? scorerFrom(e.shortText, e.type?.text) ?? ""),
      assist: armenianPlayerName(e.athletesInvolved?.[1]?.displayName ?? assistFrom(e.text) ?? ""),
      label: eventLabel(e.type?.text ?? e.text ?? ""),
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
      // The two clubs in the title were the only crests on the page leading
      // nowhere: homeId is the paid provider's number and ESPN has no such
      // thing, so the link was never drawn. The board's rows have carried
      // homeKey since they moved to ESPN; the match header had not.
      homeKey: home.team.id ? espnKey(home.team.id) : null,
      awayKey: away.team.id ? espnKey(away.team.id) : null,
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
      starters: l.starters.map((p) => ({ id: null, key: p.key, name: p.name, number: p.number, grid: p.grid, rating: p.rating })),
      substitutes: l.substitutes.map((p) => ({ id: null, key: p.key, name: p.name, number: p.number, grid: p.grid, rating: p.rating })),
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
    // No free equivalent, and inventing either would be worse than an empty
    // section: a prediction is somebody's opinion and an injury list is a
    // claim about a person's health.
    prediction: null,
    injuries: [],
    // The table belongs on a match page and ESPN has it, so the section
    // that would otherwise have gone missing comes back.
    standings: league ? await espnStandings(codeForSlug(slug)) : null,
    // Filled by the caller, not here.
    //
    // This asked topscorers-server for the chart directly, and MEASURED on
    // 6 September the match modal's own JSON came back with twenty rows of
    // standings and topScorers null - the two set on adjacent lines of this
    // object, from the same league, at the same moment. The difference is
    // that espnStandings lives in this file while getTopScorers is reached
    // by `await import("./topscorers-server")` - and that file reaches back
    // here the same way. Two chunks, each loaded lazily, each importing the
    // other: what one of them sees of the other is not finished, the call
    // throws, and the try/catch around it turned a broken import into a
    // missing tab.
    //
    // So this file stays a client for ESPN and nothing else, and
    // live-match-details-v2 - which already asks for the chart on the paid
    // path - fills this one too.
    topScorers: null,
    formGuide: [],
    // What the old layout had no room for.
    statRows: statRowsFrom(detail),
    playerLines: playerLinesFrom(detail),
    commentary: detail?.commentary ?? [],
    commentarySource: detail?.commentarySource ?? null,
  };
}

// The site's league codes are keyed the other way round. Exported because
// the match path now fills its scoring chart from live-match-details-v2,
// which holds the id ("espn-eng.1-401879288") and needs the code.
export function espnCodeForSlug(slug: string): string {
  return codeForSlug(slug);
}

function codeForSlug(slug: string): string {
  const found = Object.entries(ESPN_SLUG_BY_CODE).find(([, s]) => s === slug);
  return found?.[0] ?? "";
}

// Home against away, in the order a reader looks for them rather than the
// order ESPN sends them.
function statRowsFrom(detail: EspnMatchDetail | null): { label: string; home: string; away: string }[] {
  if (!detail || detail.statistics.length !== 2) return [];
  const [home, away] = detail.statistics;
  const labels = home.rows.map((r) => r.label);
  return labels
    .map((label) => ({
      label,
      home: home.rows.find((r) => r.label === label)?.value ?? "",
      away: away.rows.find((r) => r.label === label)?.value ?? "",
    }))
    .filter((row) => row.home || row.away);
}

function playerLinesFrom(detail: EspnMatchDetail | null): Record<string, { label: string; value: number }[]> {
  const lines: Record<string, { label: string; value: number }[]> = {};
  for (const lineup of detail?.lineups ?? []) {
    for (const player of [...lineup.starters, ...lineup.substitutes]) {
      if (player.did.length) lines[player.name] = player.did;
    }
  }
  return lines;
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
      // A score here does not mean the match is over. MEASURED on the
      // deployed board at 15:38 on 6 September, thirty-eight minutes into
      // Shirak against Sardarapat: this provider already had the fixture
      // in eventspastleague with 1-0, and the site printed "Ավարտված
      // Շիրակ 1 : 0 Սարդարապատ" while the second half had not started.
      // Telling a reader a match has ended when it has not is worse than
      // telling them nothing, so a match whose kick-off is inside the two
      // and a quarter hours a football match takes is called what it is.
      //
      // Marked live with no minute rather than with a wrong one: this
      // provider's free tier has no clock, and inventing one is how the
      // last wrong thing on this board got there.
      const tooEarlyToBeOver = played && kickoff !== null && Date.now() < kickoff.getTime() + 135 * 60_000;
      return {
        id: `sdb-${e.idEvent}`,
        status: tooEarlyToBeOver ? "Ընթացքում" : played ? "Ավարտված" : kickoff ? formatTimeYerevan(kickoff.toISOString()) : "",
        competition: "Հայաստանի Պրեմիեր լիգա",
        home: armenianTeamName(e.strHomeTeam ?? ""),
        away: armenianTeamName(e.strAwayTeam ?? ""),
        homeId: null,
        awayId: null,
        homeLogo: e.strHomeTeamBadge ?? null,
        awayLogo: e.strAwayTeamBadge ?? null,
        homeScore: played ? Number(e.intHomeScore) : null,
        awayScore: played ? Number(e.intAwayScore) : null,
        // Live only in the sense above - a match that has started and has
        // not had time to finish. This provider has no clock and no live
        // feed, so the badge carries no minute; it is the fallback behind
        // Highlightly, which does carry one. armenianMatchWindow, which
        // used to decide when to spend an API-Football request on top,
        // went with that provider.
        isLive: tooEarlyToBeOver,
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
//
// Armenia is the part of those four that cannot wait, and it is also the
// part ESPN cannot take: its 218 soccer leagues do not include the
// Armenian Premier League. Highlightly, the only free source that does,
// was asked for the same four on 6 September and has none of them - no
// squad endpoint in any spelling (/teams/{id}/squad and /squads both 404)
// and no /top-scorers - while /teams and /players answer with an id, a
// name and a badge and nothing else. So from 23 September the Armenian
// squad, the Armenian scoring chart and an Armenian player's profile have
// no free source at all, and the surfaces that showed them hide
// themselves rather than stand empty. The board and the match page do not:
// those moved to Highlightly, which carries them.


// ---------------------------------------------------------------------
// The four pages that were still on the paid provider
// ---------------------------------------------------------------------
//
// The note above says the work is the mapping, and that turned out to be
// half right. It assumed the mapping had to be built from API-Football's
// club list, which on 6 September answered "You have reached the request
// limit for the day" - the free plan's hundred, spent. A map that cannot
// be built from a source that is being cancelled is not a map to build.
//
// What the site already has is better: every club it links to is in the
// standings rows in its own D1 cache, with API-Football's number beside
// the club's name. So the old number resolves through the name, at the
// moment somebody follows an indexed link, and no table has to be kept in
// step with two providers. New links carry ESPN's number under an
// "espn-" prefix, which cannot be mistaken for the old one.

export const ESPN_ID_PREFIX = "espn-";
export const espnKey = (id: string | number) => `${ESPN_ID_PREFIX}${id}`;
export function parseEspnKey(value: string): string | null {
  return value.startsWith(ESPN_ID_PREFIX) ? value.slice(ESPN_ID_PREFIX.length) : null;
}

export type EspnTeam = { id: string; slug: string; name: string; shortName: string; logo: string | null };

type EspnTeamsResponse = {
  sports?: { leagues?: { teams?: { team?: { id?: string; displayName?: string; shortDisplayName?: string; name?: string; logos?: { href?: string }[] } }[] }[] }[];
};

// One league's clubs. Small, changes twice a year, and asked for by every
// lookup below, so it is worth the round trip only once per league.
export async function espnTeams(slug: string): Promise<EspnTeam[]> {
  const data = await espnJson<EspnTeamsResponse>(`/${slug}/teams?limit=100`);
  return (data?.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map((entry) => entry.team)
    .filter((team): team is NonNullable<typeof team> => Boolean(team?.id && team?.displayName))
    .map((team) => ({
      id: String(team.id),
      slug,
      name: team.displayName ?? "",
      shortName: team.shortDisplayName ?? team.name ?? team.displayName ?? "",
      logo: team.logos?.[0]?.href ?? null,
    }));
}

// The two providers spell a club differently often enough that an exact
// match finds about four in five. Fold the punctuation and the accents
// first, then fall back to a shared long word, which is what makes
// "Wolves" and "Wolverhampton Wanderers" the same club.
const foldName = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const longWords = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((word) => word.length > 3);

export function matchTeamByName(teams: EspnTeam[], name: string): EspnTeam | null {
  const folded = foldName(name);
  const exact = teams.find((team) => foldName(team.name) === folded || foldName(team.shortName) === folded);
  if (exact) return exact;
  const wanted = longWords(name);
  if (!wanted.length) return null;
  return teams.find((team) => longWords(team.name).some((word) => wanted.includes(word))) ?? null;
}

// Search every competition the board carries. Used only when somebody
// follows a link numbered by the old provider, which is rare enough that
// searching is cheaper than maintaining a table.
export async function findEspnTeamByName(name: string): Promise<EspnTeam | null> {
  for (const league of ESPN_LEAGUES) {
    const teams = await espnTeams(league.slug);
    const hit = matchTeamByName(teams, name);
    if (hit) return hit;
  }
  return null;
}

// Which competition a club plays in, by ESPN's id. The roster endpoint is
// addressed by league and club together, and a link only carries the club,
// so the index is built once from the same team lists the name search
// uses. Seventeen requests, and clubs move between competitions twice a
// year, so the caller caches it for a day.
export async function espnTeamIndex(): Promise<Record<string, EspnTeam>> {
  const index: Record<string, EspnTeam> = {};
  for (const league of ESPN_LEAGUES) {
    for (const team of await espnTeams(league.slug)) {
      // A club in both a domestic league and a European one is listed
      // twice; the first entry wins, and ESPN_LEAGUES puts the European
      // competitions first, where a club's roster is just as complete.
      index[team.id] ??= team;
    }
  }
  return index;
}

type EspnRosterResponse = {
  team?: { id?: string; displayName?: string; logos?: { href?: string }[] };
  athletes?: {
    id?: string;
    displayName?: string;
    fullName?: string;
    jersey?: string;
    age?: number;
    citizenship?: string;
    headshot?: { href?: string };
    position?: { name?: string; displayName?: string };
    items?: unknown[];
  }[];
  coach?: { id?: string; firstName?: string; lastName?: string }[];
};

// ESPN's own position words, in the site's four groups. It says Forward
// where API-Football said Attacker, and the squad page orders its sections
// by these strings, so the mapping is to the site's vocabulary rather than
// to ESPN's.
const ESPN_POSITION: Record<string, string> = {
  Goalkeeper: "Goalkeeper",
  Defender: "Defender",
  Midfielder: "Midfielder",
  Forward: "Attacker",
  Attacker: "Attacker",
};

export type EspnSquad = {
  teamName: string;
  teamLogo: string | null;
  players: { id: string; name: string; number: number | null; position: string; age: number | null; photo: string | null }[];
};

// One request for the whole squad, with the shirt number, the position,
// the age and the headshot. API-Football charged for the photos.
export async function espnSquad(slug: string, teamId: string): Promise<EspnSquad | null> {
  const data = await espnJson<EspnRosterResponse>(`/${slug}/teams/${teamId}/roster`);
  const athletes = data?.athletes ?? [];
  if (!athletes.length) return null;
  return {
    teamName: armenianTeamName(data?.team?.displayName ?? ""),
    teamLogo: data?.team?.logos?.[0]?.href ?? null,
    players: athletes
      .filter((athlete) => athlete.id && athlete.displayName)
      .map((athlete) => ({
        id: String(athlete.id),
        name: athlete.displayName ?? "",
        number: athlete.jersey ? Number(athlete.jersey) : null,
        position: ESPN_POSITION[athlete.position?.name ?? ""] ?? athlete.position?.displayName ?? "",
        age: typeof athlete.age === "number" ? athlete.age : null,
        photo: athlete.headshot?.href ?? null,
      })),
  };
}

type EspnLeaderEntry = {
  displayValue?: string;
  shortDisplayValue?: string;
  value?: number;
  athlete?: { id?: string; displayName?: string; headshot?: { href?: string }; team?: { id?: string; displayName?: string; logos?: { href?: string }[] } };
};

// ESPN nests the scoring charts differently between competitions, so the
// list is found by what it holds rather than by where it sits: the first
// array of leaders whose name says goals. Guessing the path is exactly
// what put this file's player statistics in the wrong place twice.
function findLeaders(value: unknown, wanted: RegExp): EspnLeaderEntry[] | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findLeaders(item, wanted);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "";
    const leaders = record.leaders;
    if (wanted.test(name) && Array.isArray(leaders) && leaders.length) return leaders as EspnLeaderEntry[];
    for (const nested of Object.values(record)) {
      const found = findLeaders(nested, wanted);
      if (found) return found;
    }
  }
  return null;
}

// ESPN writes the rest of a leader's season into a sentence rather than
// into fields: displayValue is "Matches: 3, Goals: 3" and
// shortDisplayValue is "M: 3, G: 3: A: 0". The assists live only in the
// short one, so both are read.
const readNumber = (text: string, pattern: RegExp) => {
  const found = text.match(pattern);
  return found ? Number(found[1]) : 0;
};

// Four doors to the same list, tried in order.
//
// MEASURED from inside the Worker on 6 September: every other ESPN call the
// site makes answers - the tables, the clubs, a squad, a player - and
// /apis/site/v2/.../leaders alone comes back empty in under thirty
// milliseconds, while the identical URL answers a GitHub runner with fifty
// names. So it is not the reader and not the host: Akamai refuses that one
// path from Cloudflare's addresses. cdn.espn.com and the core API are
// different doors to the same data, and cdn.espn.com already answers this
// Worker.
//
// findLeaders searches by what a thing holds rather than where it sits, so
// it copes with all four shapes without a parser each.
export function leaderUrls(slug: string): string[] {
  const year = new Date().getUTCMonth() + 1 >= 7 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  return [
    `${HOST}/${slug}/leaders`,
    `${STANDINGS_HOST}/${slug}/leaders`,
    `https://cdn.espn.com/core/soccer/stats/_/league/${slug}?xhr=1`,
    `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${slug}/seasons/${year}/types/1/leaders?limit=50`,
  ];
}

export async function espnTopScorers(code: string): Promise<import("./topscorers-server").TopScorer[] | null> {
  const slug = ESPN_SLUG_BY_CODE[code];
  if (!slug) return null;
  let leaders: EspnLeaderEntry[] | null = null;
  for (const url of leaderUrls(slug)) {
    const data = await espnUrl<unknown>(url);
    leaders = data ? findLeaders(data, /goal/i) : null;
    if (leaders?.length) break;
  }
  if (!leaders?.length) return null;
  return leaders.slice(0, 20).map((entry, index) => {
    const long = entry.displayValue ?? "";
    const short = entry.shortDisplayValue ?? "";
    return {
      rank: index + 1,
      id: Number(entry.athlete?.id ?? 0),
      key: entry.athlete?.id ? espnKey(entry.athlete.id) : null,
      teamKey: entry.athlete?.team?.id ? espnKey(entry.athlete.team.id) : null,
      name: armenianPlayerName(entry.athlete?.displayName ?? ""),
      photo: entry.athlete?.headshot?.href ?? null,
      team: armenianTeamName(entry.athlete?.team?.displayName ?? ""),
      teamId: null,
      teamLogo: entry.athlete?.team?.logos?.[0]?.href ?? null,
      goals: Number(entry.value ?? 0) || readNumber(long, /Goals:\s*(\d+)/i) || readNumber(short, /\bG:\s*(\d+)/),
      assists: readNumber(short, /\bA:\s*(\d+)/) || readNumber(long, /Assists:\s*(\d+)/i),
      appearances: readNumber(long, /Matches:\s*(\d+)/i) || readNumber(short, /\bM:\s*(\d+)/),
    };
  }).filter((row) => row.name);
}

// ---------------------------------------------------------------------
// The player page
// ---------------------------------------------------------------------
//
// Measured rather than assumed, from Kepa Arrizabalaga on 6 September:
//
//   /athletes/<id>        the profile - name, date of birth, height and
//                         weight, citizenship, position, shirt, headshot
//   /athletes/<id>/stats  the numbers, and more than the season: a filter
//                         listing every club the player has appeared for,
//                         and a statistics block per club, competition and
//                         season, with ten named columns and a written
//                         description of each
//
// API-Football gave one season and charged for the photo. The shapes below
// are read leniently - by what a field is called rather than where it sits -
// because ESPN nests these differently between competitions, and reading it
// by an assumed path is what this file has already got wrong twice.


// ESPN's own column names, in Armenian. The player page prints one table
// per season with whatever columns the provider sends, which is what lets a
// goalkeeper's saves and a striker's shots both survive - but it printed
// them in English on an Armenian site: STARTS, FOULS COMMITTED, OFFSIDES.
// Keyed on the displayName ESPN sends, lower-cased, because that is the
// string the table actually renders.
const COLUMN_HY: Record<string, string> = {
  starts: "Մեկնարկային",
  appearances: "Խաղ",
  "sub ins": "Փոխարինմամբ",
  minutes: "Րոպե",
  "total goals": "Գոլ",
  goals: "Գոլ",
  assists: "Ասիստ",
  shots: "Հարված",
  "shots on goal": "Դարպասի ուղղությամբ",
  "shots on target": "Դարպասի ուղղությամբ",
  "fouls committed": "Խախտում",
  "fouls suffered": "Իր վրա խախտում",
  offsides: "Խաղից դուրս",
  "yellow cards": "Դեղին քարտ",
  "red cards": "Կարմիր քարտ",
  "own goals": "Ինքնագոլ",
  saves: "Փրկում",
  "goals conceded": "Բաց թողած գոլ",
  "clean sheets": "Չոր խաղ",
  "shots faced": "Դիմացի հարված",
  "penalty kick goals": "Պենալտիից գոլ",
  "penalty kick shots": "Պենալտի",
  "penalty kicks saved": "Փրկած պենալտի",
  "goal assists": "Ասիստ",
  "total shots": "Հարված",
  "effective clearance": "Մաքրում",
  tackles: "Խլում",
  interceptions: "Ընդհատում",
  "won corners": "Անկյունային",
  "game winning goals": "Հաղթական գոլ",
  "total passes": "Փոխանցում",
  "accurate passes": "Ճշգրիտ փոխանցում",
  "pass pct": "Փոխանցման ճշգրտություն",
  "shot pct": "Հարվածի ճշգրտություն",
};

// ESPN reports a footballer's position in English and in its own words.
const POSITION_ESPN_HY: Record<string, string> = {
  goalkeeper: "Դարպասապահ",
  defender: "Պաշտպան",
  midfielder: "Կիսապաշտպան",
  forward: "Հարձակվող",
  attacker: "Հարձակվող",
  striker: "Հարձակվող",
  "center back": "Կենտրոնական պաշտպան",
  "full back": "Եզրային պաշտպան",
  winger: "Եզրային հարձակվող",
};

// Inches and pounds mean nothing to an Armenian reader; ESPN sends both the
// raw numbers and its own "6' 4\"" rendering of them, so the raw ones are
// converted rather than the string reformatted.
const centimetres = (inches: number | undefined) =>
  typeof inches === "number" && inches > 0 ? `${Math.round(inches * 2.54)} սմ` : null;
const kilograms = (pounds: number | undefined) =>
  typeof pounds === "number" && pounds > 0 ? `${Math.round(pounds * 0.45359237)} կգ` : null;

const ATHLETE_HOST = "https://site.web.api.espn.com/apis/common/v3/sports/soccer";

type EspnStatCategory = {
  name?: string;
  displayName?: string;
  names?: string[];
  displayNames?: string[];
  descriptions?: string[];
  statistics?: {
    teamId?: number;
    teamSlug?: string;
    leagueId?: number;
    leagueSlug?: string;
    season?: { year?: number; displayName?: string };
    stats?: (string | number)[];
  }[];
};

type EspnAthleteResponse = {
  athlete?: {
    id?: string;
    displayName?: string;
    fullName?: string;
    age?: number;
    dateOfBirth?: string;
    height?: number;
    weight?: number;
    displayHeight?: string;
    displayWeight?: string;
    citizenship?: string;
    birthPlace?: { city?: string; country?: string };
    jersey?: string;
    headshot?: { href?: string };
    position?: { displayName?: string; name?: string };
    team?: { id?: string; displayName?: string; logos?: { href?: string }[] };
  };
};

type EspnAthleteStatsResponse = {
  filters?: { name?: string; options?: { value?: string; displayValue?: string }[] }[];
  teams?: Record<string, { id?: string; displayName?: string; logos?: { href?: string }[] }>;
  leagues?: Record<string, { displayName?: string; logos?: { href?: string }[] }>;
  categories?: EspnStatCategory[];
};

export type EspnPlayerSeason = {
  season: string;
  league: string;
  leagueLogo: string | null;
  team: string;
  teamLogo: string | null;
  // Every column the provider names, in its own order, so a goalkeeper's
  // saves and an attacker's shots both survive rather than being squeezed
  // into one fixed set of six.
  columns: { label: string; value: string; note: string | null }[];
};

export type EspnPlayer = {
  id: string;
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
  currentTeamKey: string | null;
  currentTeamLogo: string | null;
  shirtNumber: number | null;
  clubs: string[];
  seasons: EspnPlayerSeason[];
};

// The core API's career total, for a footballer the other address has no
// table for.
//
// MEASURED on 6 September, three men, five addresses each:
//
//   Isak     /athletes/{id}/stats            PASS, one category, two blocks
//   Barcola  /athletes/{id}/stats            nothing the page could show
//            core /athletes/{id}/statistics  PASS, splits with categories
//   Ferreira core and common both            404 - he no longer plays
//
// So ESPN has Bradley Barcola's figures and this file was asking the one
// address that does not carry them. What the core gives is a single total
// across every competition rather than a season-by-season table, so it is
// the fallback and not the source: one row, labelled for what it is.
type EspnCoreStats = {
  splits?: {
    categories?: {
      name?: string;
      displayName?: string;
      stats?: { name?: string; displayName?: string; shortDisplayName?: string; description?: string; value?: number; displayValue?: string }[];
    }[];
  };
};

// What a reader wants to know about a footballer, in the order a reader
// wants it, and nothing else.
//
// The core API sends everything it holds - about forty fields, including
// "timeStarted 28002", "timeEnded 69519", "didNotPlay 27" and a goal
// difference for one man. Printed whole, that was twenty-odd columns
// scrolling sideways under English headings, most of them meaningless.
// So this is a list rather than a translation table: a field not on it does
// not appear, which also means no English can leak onto the page.
const CAREER_COLUMNS: [string, string][] = [
  ["appearances", "Խաղ"],
  ["starts", "Մեկնարկային"],
  ["subIns", "Փոխարինմամբ"],
  ["totalGoals", "Գոլ"],
  ["goals", "Գոլ"],
  ["goalAssists", "Ասիստ"],
  ["assists", "Ասիստ"],
  ["totalShots", "Հարված"],
  ["shotsOnTarget", "Դարպասի ուղղությամբ"],
  ["gameWinningGoals", "Հաղթական գոլ"],
  ["penaltyKickGoals", "Պենալտիից գոլ"],
  ["ownGoals", "Ինքնագոլ"],
  ["totalPasses", "Փոխանցում"],
  ["accuratePasses", "Ճշգրիտ փոխանցում"],
  ["tacklesWon", "Խլում"],
  ["interceptions", "Ընդհատում"],
  ["effectiveClearance", "Մաքրում"],
  ["foulsCommitted", "Խախտում"],
  ["foulsSuffered", "Իր վրա խախտում"],
  ["offsides", "Խաղից դուրս"],
  ["yellowCards", "Դեղին քարտ"],
  ["redCards", "Կարմիր քարտ"],
  // A goalkeeper's, which the same response carries for the men who have
  // them and omits for everyone else.
  ["saves", "Փրկում"],
  ["goalsConceded", "Բաց թողած գոլ"],
  ["cleanSheet", "Չոր խաղ"],
  ["penaltyKicksSaved", "Փրկած պենալտի"],
];

async function espnCareerTotal(athleteId: string): Promise<EspnPlayerSeason[]> {
  const data = await espnUrl<EspnCoreStats>(`https://sports.core.api.espn.com/v2/sports/soccer/athletes/${athleteId}/statistics`);
  const byName = new Map<string, { value: string; note: string | null }>();
  for (const category of data?.splits?.categories ?? []) {
    for (const stat of category.stats ?? []) {
      const name = stat.name ?? "";
      if (!name || byName.has(name)) continue;
      const value = stat.displayValue ?? (stat.value === undefined ? "" : String(stat.value));
      byName.set(name, { value, note: stat.description ?? null });
    }
  }

  const columns: { label: string; value: string; note: string | null }[] = [];
  for (const [name, label] of CAREER_COLUMNS) {
    const stat = byName.get(name);
    // Zero is not worth a column: a defender with no goals should not have
    // a goals column reading nought beside his tackles. Nor should the same
    // number appear twice because ESPN names it two ways.
    if (!stat || !stat.value || stat.value === "0" || stat.value === "0.0") continue;
    if (columns.some((existing) => existing.label === label)) continue;
    columns.push({ label, value: stat.value, note: stat.note });
  }
  if (!columns.length) return [];
  return [{
    // Not a season, and the heading says so rather than inventing a year.
    season: "Կարիերա",
    league: "",
    leagueLogo: null,
    team: "",
    teamLogo: null,
    columns,
  }];
}

export async function espnPlayer(athleteId: string): Promise<EspnPlayer | null> {
  const [profile, stats] = await Promise.all([
    espnUrl<EspnAthleteResponse>(`${ATHLETE_HOST}/athletes/${athleteId}`),
    espnUrl<EspnAthleteStatsResponse>(`${ATHLETE_HOST}/athletes/${athleteId}/stats`),
  ]);
  const athlete = profile?.athlete;
  if (!athlete?.displayName) return null;

  const teamsById: Record<string, { name: string; logo: string | null }> = {};
  for (const team of Object.values(stats?.teams ?? {})) {
    if (team?.id) teamsById[String(team.id)] = { name: team.displayName ?? "", logo: team.logos?.[0]?.href ?? null };
  }
  const leaguesBySlug = stats?.leagues ?? {};

  const named: EspnPlayerSeason[] = [];
  const seasons = named;
  for (const category of stats?.categories ?? []) {
    const labels = category.displayNames ?? category.names ?? [];
    const notes = category.descriptions ?? [];
    for (const block of category.statistics ?? []) {
      const team = block.teamId ? teamsById[String(block.teamId)] : undefined;
      const league = block.leagueSlug ? leaguesBySlug[block.leagueSlug] : undefined;
      const columns = (block.stats ?? [])
        .map((value, index) => {
          const english = (labels[index] ?? "").toLowerCase();
          // A column this file has no Armenian name for is dropped, not
          // printed in English. It used to fall back to the provider's own
          // heading, which put SHOTS BLOCKED and TIME STARTED across a page
          // that is Armenian everywhere else - and a heading nobody can read
          // is worth less than the space it takes.
          return { label: COLUMN_HY[english] ?? "", value: String(value ?? ""), note: notes[index] ?? null };
        })
        .filter((column) => column.label && column.value !== "" && column.value !== "0");
      if (!columns.length) continue;
      const key = `${block.season?.displayName ?? block.season?.year ?? ""}|${block.leagueSlug ?? ""}|${block.teamId ?? ""}`;
      const existing = seasons.find((s) => `${s.season}|${block.leagueSlug ?? ""}|${block.teamId ?? ""}` === key);
      // The offensive and defensive categories describe the same season, so
      // the second one adds its columns rather than a second row.
      if (existing) { existing.columns.push(...columns); continue; }
      seasons.push({
        // ESPN writes the season as "2026-27 English Premier League", so
        // printing it whole put the competition's English name beside its
        // Armenian one on every heading. Keep the years.
        season: (block.season?.displayName ?? "").match(/^\d{4}(?:-\d{2,4})?/)?.[0]
          ?? String(block.season?.year ?? ""),
        league: league?.displayName ? armenianCompetition(league.displayName) : "",
        leagueLogo: league?.logos?.[0]?.href ?? null,
        team: team?.name ? armenianTeamName(team.name) : "",
        teamLogo: team?.logo ?? null,
        columns,
      });
    }
  }

  const clubFilter = (stats?.filters ?? []).find((filter) => filter.name === "team");
  const birthPlace = [athlete.birthPlace?.city, athlete.birthPlace?.country].filter(Boolean).join(", ");

  return {
    id: String(athlete.id ?? athleteId),
    name: armenianPlayerName(athlete.displayName),
    photo: athlete.headshot?.href ?? null,
    nationality: athlete.citizenship ? armenianCountry(athlete.citizenship) : null,
    birthDate: athlete.dateOfBirth ? athlete.dateOfBirth.slice(0, 10) : null,
    birthPlace: birthPlace || null,
    height: centimetres(athlete.height) ?? athlete.displayHeight ?? null,
    weight: kilograms(athlete.weight) ?? athlete.displayWeight ?? null,
    age: typeof athlete.age === "number" ? athlete.age : null,
    position: (() => {
      const raw = athlete.position?.displayName ?? athlete.position?.name ?? "";
      return POSITION_ESPN_HY[raw.toLowerCase()] ?? (raw || null);
    })(),
    currentTeam: athlete.team?.displayName ? armenianTeamName(athlete.team.displayName) : null,
    currentTeamKey: athlete.team?.id ? espnKey(athlete.team.id) : null,
    currentTeamLogo: athlete.team?.logos?.[0]?.href ?? null,
    shirtNumber: athlete.jersey ? Number(athlete.jersey) : null,
    // Every club the provider has this player's numbers for, which is a
    // career in the order it happened rather than a transfer list we would
    // have to buy.
    clubs: (clubFilter?.options ?? []).map((option) => armenianTeamName(option.displayValue ?? "")).filter(Boolean),
    // The season table when there is one, the career total when there is
    // not. Barcola's page carried his photograph, his club and his height
    // and then said his statistics were unavailable, because this file
    // asked one address and ESPN keeps his figures at another.
    seasons: await (async () => {
      // A block with no season named is not a row - that filter was here
      // before and stays, or the table grows a heading with nothing above
      // it.
      const dated = named.filter((season) => season.season);
      return dated.length ? dated : await espnCareerTotal(athleteId);
    })(),
  };
}

// ---------------------------------------------------------------------
// The faces
// ---------------------------------------------------------------------
//
// MEASURED on 6 September: ESPN names a headshot for two of Arsenal's
// twenty-four players, and for the other twenty-two the file does not exist
// - the direct address and the combiner both answer 404. So a squad page
// drawn from ESPN alone is a grid of letters. API-Football had a photo for
// almost everyone, and that is the one thing being given up by leaving it.
//
// TheSportsDB fills it, for nothing, and per club rather than per player:
// one request returns a whole squad with a cutout each. Twenty clubs in
// seven leagues is a hundred and forty requests in total, not four thousand,
// and only for a club somebody actually opens. The caller caches the answer
// for a month, because a squad photograph does not change on a Tuesday.

type SportsDbTeamSearch = { teams?: { idTeam?: string; strTeam?: string }[] };
type SportsDbPlayers = {
  player?: { strPlayer?: string; strCutout?: string | null; strThumb?: string | null; strRender?: string | null }[];
};

// Compared with the accents removed and the punctuation dropped, but the
// word breaks KEPT: the first version of this joined the letters into one
// string and demanded an exact match, which is why half a squad came back
// faceless. The two providers agree on the letters and disagree on how many
// names a footballer has - ESPN writes "Pedro Neto" where TheSportsDB
// writes "Pedro Lomba Neto", "Joao Pedro" against "Joao Pedro Junqueira de
// Jesus", "Estevao" against "Estevao Willian". Keeping the spaces is what
// lets pickPhoto below compare them word by word.
const photoKey = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, " ").trim().replace(/\s+/g, " ");

// Two maps, not one, because a squad should look like one photo session.
//
// The provider carries three kinds of picture and they do not sit together
// on a page: strCutout is a head-and-shoulders on a transparent ground,
// strThumb is a photograph taken during a match, strRender something else
// again. Collapsing them into one field - which this did - gave a squad
// where some men were studio portraits and their team-mates were caught
// mid-stride against a crowd.
//
// So the cutouts are kept apart from the rest. The page fills every place
// it can from `cut` first, and only reaches into `alt` for a footballer no
// cutout exists for anywhere.
export type SportsDbPhotos = { cut: Record<string, string>; alt: Record<string, string> };

export async function sportsDbSquadPhotos(clubName: string): Promise<SportsDbPhotos> {
  const found = await sportsDb<SportsDbTeamSearch>(`/searchteams.php?t=${encodeURIComponent(clubName)}`);
  const teamId = found?.teams?.[0]?.idTeam;
  if (!teamId) return { cut: {}, alt: {} };
  const squad = await sportsDb<SportsDbPlayers>(`/lookup_all_players.php?id=${teamId}`);
  const photos: SportsDbPhotos = { cut: {}, alt: {} };
  for (const player of squad?.player ?? []) {
    if (!player.strPlayer) continue;
    const key = photoKey(player.strPlayer);
    if (player.strCutout) photos.cut[key] = player.strCutout;
    else if (player.strThumb || player.strRender) photos.alt[key] = (player.strThumb || player.strRender) as string;
  }
  return photos;
}

// A stored map is either the current shape or the flat one this used to
// write. Reading both means the weekly run's rows keep working through the
// deploy that changes the shape, instead of a day with no faces at all.
export function readPhotoMaps(payload: unknown): SportsDbPhotos {
  const value = payload as Partial<SportsDbPhotos> & Record<string, unknown>;
  if (value && typeof value === "object" && (value.cut || value.alt)) {
    return { cut: (value.cut as Record<string, string>) ?? {}, alt: (value.alt as Record<string, string>) ?? {} };
  }
  return { cut: (payload as Record<string, string>) ?? {}, alt: {} };
}

export const squadPhotoKey = photoKey;

// One footballer's face out of a club's photographs, tried three ways and
// never guessed. Each step is required to land on exactly one player: a
// squad holds brothers, and two Silvas with one photograph between them is
// worse than no photograph at all.
//
//   1. the same name, letter for letter
//   2. every word of the shorter name inside the longer one, in order -
//      "pedro neto" within "pedro lomba neto"
//   3. the last word plus the first letter of the first - "S. Ramos"
//
// Written after a squad page came back with a third of its faces: the
// exact-match rule was throwing away every footballer whose two providers
// counted his names differently, which in a Premier League squad is most
// of the Brazilians and half the Portuguese.
export function pickPhoto(photos: Record<string, string>, name: string): string | null {
  const key = photoKey(name);
  if (!key) return null;
  if (photos[key]) return photos[key];

  const words = key.split(" ");
  const entries = Object.entries(photos).map(([k, url]) => ({ words: k.split(" "), url }));

  const inOrder = (few: string[], many: string[]) => {
    let at = 0;
    for (const word of few) {
      const found = many.indexOf(word, at);
      if (found < 0) return false;
      at = found + 1;
    }
    return true;
  };
  const contained = entries.filter((entry) =>
    entry.words.length >= words.length ? inOrder(words, entry.words) : inOrder(entry.words, words));
  if (contained.length === 1) return contained[0].url;

  const surname = words[words.length - 1];
  const initial = words[0][0];
  const bySurname = entries.filter((entry) =>
    entry.words[entry.words.length - 1] === surname && entry.words[0][0] === initial);
  if (bySurname.length === 1) return bySurname[0].url;

  return null;
}

// ---------------------------------------------------------------------
// The scoring chart, after ESPN took the named list away
// ---------------------------------------------------------------------
//
// MEASURED on 6 September, from a GitHub runner, eight addresses:
//
//   /apis/site/v2/.../leaders          404   (200 with fifty names an hour earlier)
//   /apis/site/v2/.../leaders?season   404
//   /apis/v2/.../leaders               404
//   /apis/common/v3/.../leaders        404
//   /apis/common/v3/.../statistics     404
//   cdn.espn.com/core/soccer/stats     404
//   cdn.espn.com/core/soccer/scoreboard 200, no leaders in it
//   sports.core.api.../leaders         200, fifty entries - athlete is a $ref
//
// So the only list left names nobody: each entry points at an athlete
// document, and reading fifty of them is fifty requests inside one page
// render, for one league, of seven.
//
// The names are already somewhere cheaper. A league's clubs are one
// request and each club's roster is one more - twenty for a league, once a
// day - and between them they name every footballer who can appear in that
// league's chart. So the chart is one request plus a lookup, and the index
// is what the caller caches.

export type EspnAthleteIndex = Record<string, { name: string; team: string; teamKey: string | null; teamLogo: string | null; photo: string | null }>;

export async function espnLeagueAthletes(slug: string): Promise<EspnAthleteIndex> {
  const clubs = await espnTeams(slug);
  const index: EspnAthleteIndex = {};
  // Sequential in batches rather than twenty at once: a Worker has a ceiling
  // on subrequests in flight, and this runs once a day behind a cache.
  for (let start = 0; start < clubs.length; start += 5) {
    const batch = clubs.slice(start, start + 5);
    const rosters = await Promise.all(batch.map((club) => espnSquad(slug, club.id).catch(() => null)));
    rosters.forEach((roster, offset) => {
      const club = batch[offset];
      for (const player of roster?.players ?? []) {
        index[player.id] ??= {
          name: player.name,
          team: armenianTeamName(club.name),
          teamKey: espnKey(club.id),
          teamLogo: club.logo,
          photo: player.photo,
        };
      }
    });
  }
  return index;
}

// The core API writes the footballer as a link ending in their id.
const athleteIdFromRef = (ref: string | undefined) => ref?.match(/athletes\/(\d+)/)?.[1] ?? null;

export async function espnCoreLeaders(slug: string): Promise<{ id: string; long: string; short: string; value: number }[] | null> {
  const year = new Date().getUTCMonth() + 1 >= 7 ? new Date().getUTCFullYear() : new Date().getUTCFullYear() - 1;
  const data = await espnUrl<unknown>(
    `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${slug}/seasons/${year}/types/1/leaders?limit=50`,
  );
  const leaders = data ? findLeaders(data, /goal/i) : null;
  if (!leaders?.length) return null;
  return leaders
    .map((entry) => ({
      id: athleteIdFromRef((entry.athlete as { $ref?: string } | undefined)?.$ref) ?? "",
      long: entry.displayValue ?? "",
      short: entry.shortDisplayValue ?? "",
      value: Number(entry.value ?? 0),
    }))
    .filter((entry) => entry.id);
}
