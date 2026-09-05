import test from "node:test";
import assert from "node:assert/strict";
import { espnTopScorers } from "../lib/espn.ts";

// The shape ESPN actually returned for /eng.1/leaders on 6 September, cut
// down to two entries. The scoring charts went blank on the live site while
// every host probe answered 200, which is the difference between a host
// answering and the function that reads it returning something - so the
// reader is pinned here, against the real shape, where a deploy is not
// needed to find out.
const REAL_SHAPE = {
  status: "success",
  season: { year: 2026, displayName: "2026-27" },
  stats: [
    {
      name: "goalsLeaders",
      displayName: "Goals",
      abbreviation: "G",
      leaders: [
        {
          displayValue: "Matches: 3, Goals: 3",
          shortDisplayValue: "M: 3, G: 3: A: 0",
          value: 3,
          athlete: {
            id: "12345",
            displayName: "Erling Haaland",
            headshot: { href: "https://a.espncdn.com/i/headshots/soccer/players/full/12345.png" },
            team: { id: "382", displayName: "Manchester City", logos: [{ href: "https://a.espncdn.com/i/teamlogos/soccer/500/382.png" }] },
          },
        },
        {
          displayValue: "Matches: 4, Goals: 2",
          shortDisplayValue: "M: 4, G: 2: A: 2",
          value: 2,
          athlete: {
            id: "67890",
            displayName: "Bukayo Saka",
            team: { id: "359", displayName: "Arsenal", logos: [{ href: "https://a.espncdn.com/i/teamlogos/soccer/500/359.png" }] },
          },
        },
      ],
    },
    { name: "assistsLeaders", displayName: "Assists", leaders: [] },
  ],
};

function withFetch(payload, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  return run().finally(() => { globalThis.fetch = original; });
}

test("reads the scoring chart out of ESPN's own shape", async () => {
  const rows = await withFetch(REAL_SHAPE, () => espnTopScorers("PL"));
  assert.ok(rows, "espnTopScorers returned null for a response that has leaders in it");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].goals, 3);
  assert.equal(rows[0].appearances, 3);
  assert.equal(rows[0].assists, 0);
  // The prefix is what stops a bare ESPN number opening the page of
  // whichever footballer holds it in the other provider's numbering.
  assert.equal(rows[0].key, "espn-12345");
  assert.equal(rows[0].teamKey, "espn-382");
  assert.equal(rows[1].assists, 2);
  assert.equal(rows[1].appearances, 4);
});

test("a league ESPN does not carry returns null rather than an empty chart", async () => {
  const rows = await withFetch(REAL_SHAPE, () => espnTopScorers("ARM"));
  assert.equal(rows, null);
});

test("a response with no leaders returns null, so the fallback runs", async () => {
  const rows = await withFetch({ status: "success", stats: [] }, () => espnTopScorers("PL"));
  assert.equal(rows, null);
});
