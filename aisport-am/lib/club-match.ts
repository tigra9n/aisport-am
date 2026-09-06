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
