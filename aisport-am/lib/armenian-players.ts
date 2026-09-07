// The Armenian footballers' own pages, frozen.
//
// The squads were frozen on 7 September from API-Football, which is paid
// for until 23 September. What that subscription also served, and what
// goes with it, is the individual player page: date of birth, height,
// foot, position, nationality, market value.
//
// This file is filled from a different source, and the reason is arithmetic.
// SportAPI on RapidAPI - a Sofascore mirror - allows 50 requests a MONTH on
// its free plan. Asking it for 334 footballers one at a time would take
// most of a year. But its /team/{id}/players answers with the whole player
// object per row rather than a name and a shirt number, so twelve requests
// fill every player page in the league. Three more find the twelve clubs
// from the league table. Fifteen of fifty, once.
//
// PROVENANCE, PLAINLY. This mirror is not Sofascore's own product; it
// republishes their data. It is used here for a snapshot that is taken once
// and kept, not for anything the site asks repeatedly, and the licensed
// source is preferred wherever it still answers - which for the squads it
// does, until 23 September. If that trade ever looks worse than an empty
// page, delete this file: nothing else depends on it.
//
// Filled by .github/workflows/armenian-players.yml, dispatched by hand.
export type MirrorPlayer = {
  id: number; name: string; slug: string;
  number: number | null; position: string | null; country: string | null;
  /** Seconds since the epoch, as the mirror gives it. */
  birth: number | null;
  height: number | null; foot: string | null;
  value: number | null; contractUntil: number | null;
};
export type MirrorSquad = { teamName: string; players: MirrorPlayer[] };

// ---- generated below by .github/workflows/armenian-players.yml, do not edit ----
export const ARMENIAN_PLAYERS_TAKEN = "";
export const ARMENIAN_PLAYERS: Record<number, MirrorSquad> = {};
