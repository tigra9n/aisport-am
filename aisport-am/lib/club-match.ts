// Which ESPN club is which API-Football club, decided by the squads.
//
// This is the rule the club map is built on, and it lives here rather
// than inside the workflow that runs it so that it can be tested. What it
// gets wrong is not a missing page: it is /team/50 opening on a different
// club than the one Google indexed under that number, which is worse than
// the page going away.
//
// So a name never decides anything. An earlier draft used the name to
// choose which ESPN clubs were worth checking and threw out "Manchester
// United" against "Man United" - one shared word out of two - before the
// squads were ever compared. A heuristic that rejects is a heuristic that
// decides. Here the name is not consulted at all: every club in the
// league is scored on how many surnames its published squad shares with
// the club being matched, and the squads alone answer.

/** The family name, lowercased and stripped, or "" when it proves nothing. */
export function surnameOf(name: string): string {
  const parts = (name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z ]/g, " ")
    .split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  // Two letters is not evidence: "Ba", "Xi", and every initial that lost
  // its full stop would all collide with each other.
  return last.length > 2 ? last : "";
}

/**
 * The surnames of a squad.
 *
 * Only the last token of each name, because first names differ between
 * providers far more than family names do - one writes "Bobby
 * Decordova-Reid" where the other writes "Bobby Reid".
 */
export function surnameSet(names: string[]): Set<string> {
  return new Set(names.map(surnameOf).filter(Boolean));
}

export type ClubCandidate = { id: string; name: string; squad: Set<string> };
export type ClubVerdict = { id: string; name: string; shared: number; runnerUp: number };

/**
 * The one club whose squad proves it, or null.
 *
 * Two rules, and both have to hold:
 *
 *   four shared surnames  Three clubs in a league can share one common
 *                         name by chance - a Silva, a Fernandez - and two
 *                         can share two. Four is not chance.
 *   a clear winner        A tie means the squads did not separate the
 *                         candidates, which is not an answer. Nothing is
 *                         written rather than a coin tossed.
 *
 * A club whose squad neither provider published cannot prove anything and
 * is refused here too: the caller reports it by name so it can be
 * resolved by hand, the way the twenty-six clubs the photograph workflow
 * could not match were.
 */
export function chooseClub(ours: Set<string>, candidates: ClubCandidate[]): ClubVerdict | null {
  if (ours.size < 4) return null;
  const scored = candidates
    .map((candidate) => ({ candidate, shared: [...ours].filter((s) => candidate.squad.has(s)).length }))
    .filter((row) => row.shared > 0)
    .sort((a, b) => b.shared - a.shared);
  const best = scored[0];
  if (!best || best.shared < 4) return null;
  const runnerUp = scored[1]?.shared ?? 0;
  if (runnerUp >= best.shared) return null;
  return { id: best.candidate.id, name: best.candidate.name, shared: best.shared, runnerUp };
}

// ---------------------------------------------------------------------
// The same question about a footballer
// ---------------------------------------------------------------------
//
// An indexed /player/<n> carries API-Football's number and the free
// source numbers footballers its own way. The club map cannot help: it
// maps clubs, and there are thousands of players.
//
// What can be compared is the name, and here that is safer than it
// sounds, because BOTH sides are already written in Armenian by the same
// function. The cached top-scorer rows were spelled by
// armenianPlayerName from API-Football's Latin name; the ESPN athlete
// index is spelled by it from ESPN's. So the same footballer, written
// "Mohamed Salah" by both providers, becomes the same Armenian string on
// both sides - and where the providers disagree on the given name
// ("Bobby Decordova-Reid" against "Bobby Reid") the family name still
// agrees, exactly as it does for clubs.
//
// The refusals are what matter. A surname two footballers share is not
// an answer: the site would then be telling a reader that one man is
// another, permanently, with a 301. When a club is known it breaks a tie
// - two men with the same surname at different clubs are separable - and
// when it is not, nothing is written.

export type AthleteCandidate = { id: string; name: string; team?: string | null };

/** The footballer that one name can only mean, or null. */
export function chooseAthlete(
  name: string,
  candidates: AthleteCandidate[],
  team?: string | null,
): AthleteCandidate | null {
  // Hyphens are separators, not letters. "Bobby Decordova-Reid" against
  // "Bobby Reid" is the case this exists for, and treating the hyphenated
  // pair as one token is what made it fail.
  const key = (value: string) => (value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const family = (value: string) => {
    const parts = key(value).split(" ").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  };
  // One character is not a name. It is what is left of one this site could
  // not transliterate, and it would match any other wreck of a name.
  if (key(name).length < 2) return null;

  const only = (rows: AthleteCandidate[]): AthleteCandidate | null => {
    if (rows.length === 1) return rows[0];
    if (rows.length < 2 || !team) return null;
    // The club is the tie-breaker, and only when it picks exactly one.
    const sameClub = rows.filter((row) => key(row.team ?? "") === key(team));
    return sameClub.length === 1 ? sameClub[0] : null;
  };

  const whole = candidates.filter((row) => key(row.name) === key(name));
  if (whole.length) return only(whole);

  const wanted = family(name);
  // A one-letter family name is not a family name; it is what is left of a
  // name this site could not transliterate.
  if (wanted.length < 2) return null;
  return only(candidates.filter((row) => family(row.name) === wanted));
}
