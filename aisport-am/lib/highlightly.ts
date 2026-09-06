import type { StandingRow } from "./football";
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
