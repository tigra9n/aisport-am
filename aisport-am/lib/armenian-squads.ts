import { armenianPlayerName } from "./player-names-hy";
import type { Squad } from "./squad-server";

// The twelve Armenian squads, frozen into the repository.
//
// WHY A FILE AND NOT THE CACHE. The Pro subscription to API-Football ends
// on 23 September 2026 and the owner is not renewing it: $19 a month for
// one league. Everything else that subscription paid for has been replaced
// by Highlightly for nothing - the table, the fixtures, the live minute,
// the events, the match statistics - and eleven providers were measured
// against the one thing left. None of them carries an Armenian squad.
// Highlightly's own /lineups answers 200 for an Armenian match and returns
// two empty arrays and the formation "Unknown", while the same request for
// an English match the same afternoon named a bench with shirt numbers: it
// is coverage, so paying Highlightly would not fix it either.
//
// So the squads are taken once, now, with the key that is still paid for,
// and kept. A D1 cache row could not do this - every row in api_cache has a
// saved_at and is refetched after a day, and there would be nothing to
// refetch from. A file has no clock.
//
// WHAT IT COSTS. About 50KB in the Worker bundle for twelve clubs, and the
// squads go stale at the winter transfer window. A squad a few months old
// is worth incomparably more than no squad at all, which is the honest
// alternative after 23 September.
//
// HOW TO REFILL IT. .github/workflows/armenian-squads.yml, dispatched by
// hand. It reads /players/squads for each of the twelve and rewrites this
// file. While the key lives it reads API-Football. After that it needs a
// source; SportAPI on RapidAPI (a Sofascore mirror, 50 requests a MONTH on
// its free plan) answered with all 32 of Shirak's players, numbers and
// positions included, on 7 September, and is the standby.
//
// Names are stored as the provider spells them and translated on the way
// out, so a correction in player-names-hy.ts reaches a frozen squad too.
export type FrozenPlayer = { id: number; name: string; number: number | null; position: string; age: number | null; photo: string | null };
export type FrozenSquad = { teamName: string; teamLogo: string | null; players: FrozenPlayer[] };

/**
 * A frozen squad in the shape the club page renders, or null.
 *
 * The Armenian spelling is applied here rather than stored, so the hand
 * table in player-names-hy.ts stays the single place a name is decided.
 */
export function frozenArmenianSquad(teamId: number | string): Squad | null {
  const id = typeof teamId === "number" ? teamId : Number.parseInt(String(teamId), 10);
  if (!Number.isFinite(id)) return null;
  const frozen = ARMENIAN_SQUADS[id];
  if (!frozen?.players?.length) return null;
  return {
    teamName: frozen.teamName,
    teamLogo: frozen.teamLogo,
    players: frozen.players.map((p) => ({
      id: p.id,
      name: armenianPlayerName(p.name),
      latin: p.name,
      number: p.number,
      position: p.position,
      age: p.age,
      photo: p.photo,
    })),
  };
}

// ---- generated below by .github/workflows/armenian-squads.yml, do not edit ----
/** When these were taken. Read by whoever wonders how old they are. */
export const ARMENIAN_SQUADS_TAKEN = "";
export const ARMENIAN_SQUADS: Record<number, FrozenSquad> = {};
