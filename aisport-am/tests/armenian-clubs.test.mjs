import test from "node:test";
import assert from "node:assert/strict";
import { armenianTeamName } from "../lib/team-names-hy.ts";
import { ARMENIAN_CLUB_IDS } from "../lib/highlightly.ts";

// The twelve clubs as the table's own provider spells them, including the
// two it still files under names they dropped in 2019. Every one has to
// reach a club number, or its row on the league table leads nowhere - which
// is what happened when the table moved and the links were dropped rather
// than remapped.
const AS_HIGHLIGHTLY_WRITES_THEM = [
  "Artsakh", "Alashkert", "Ararat-Armenia", "Pyunik Yerevan", "Sardarapat",
  "Banants Yerevan", "Shirak", "BKMA", "Gandzasar", "Ararat", "Syunik", "Van",
];

test("every club on the Armenian table can be opened", () => {
  for (const name of AS_HIGHLIGHTLY_WRITES_THEM) {
    const armenian = armenianTeamName(name);
    assert.ok(ARMENIAN_CLUB_IDS[armenian], `${name} -> ${armenian} has no club number`);
  }
});

// Twelve names, twelve numbers: two clubs sharing one would put a reader on
// somebody else's squad, which is the fault this table exists to avoid.
test("no two clubs share a number", () => {
  const ids = Object.values(ARMENIAN_CLUB_IDS);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 12);
});
