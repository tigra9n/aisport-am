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
  home?: HighlightlySide;
  away?: HighlightlySide;
  team?: { id?: number; name?: string; logo?: string | null };
};
type HighlightlyStandings = { groups?: { name?: string; standings?: HighlightlyRow[] }[] };

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
      headers: { "x-api-key": key, Accept: "application/json" },
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
      const won = num(home.wins) + num(away.wins);
      const draw = num(home.draws) + num(away.draws);
      const scored = num(home.scoredGoals) + num(away.scoredGoals);
      const conceded = num(home.receivedGoals) + num(away.receivedGoals);
      return {
        position: 0,
        // armenianTeamName carries banants -> Ուրարտու, because this
        // provider still files the club under the name it dropped in 2019.
        team: armenianTeamName(row.team?.name ?? ""),
        teamId: null,
        // Highlightly's club numbers are its own, and the site's club pages
        // run on ESPN's. Linking one to the other would open a page about a
        // different club, so an Armenian row carries no link - the same
        // reason the old Armenian table carried none.
        teamKey: null,
        teamLogo: row.team?.logo ?? null,
        played: num(home.games) + num(away.games),
        won,
        draw,
        lost: num(home.loses) + num(away.loses),
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
