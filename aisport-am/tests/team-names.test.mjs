import test from "node:test";
import assert from "node:assert/strict";
import { armenianTeamName } from "../lib/team-names-hy.ts";

// ESPN writes a club's registered name where the previous provider wrote the
// short one, and on the day the board moved over it read "Տոտտենհամ Հոցպուր",
// "Նեվկաստլե Ունիտեդ" and "Րեդ Ստար Բելգրադե". Club names are the most
// visible thing on this site, so the rules that fixed those are pinned here.

test("the registered name resolves to the short one", () => {
  assert.equal(armenianTeamName("Tottenham Hotspur"), "Տոտենհեմ");
  assert.equal(armenianTeamName("Newcastle United"), "Նյուքասլ");
  assert.equal(armenianTeamName("Wolverhampton Wanderers"), "Վուլվերհեմփթոն");
  assert.equal(armenianTeamName("Leeds United"), "Լիդս");
});

test("a club that keeps its category word keeps it", () => {
  // "City" is stripped only after the full name has been tried, so the clubs
  // that are known by it are unaffected.
  assert.equal(armenianTeamName("Manchester City"), "Մանչեսթեր Սիթի");
  assert.equal(armenianTeamName("Hull City"), "Հալ Սիթի");
});

test("Armenian spells R, O and E differently at the start of a word", () => {
  assert.equal(armenianTeamName("Red Bull New York"), "Նյու Յորք Ռեդ Բուլզ");
  assert.equal(armenianTeamName("OFI Crete"), "ՕՖԻ Կրետե");
  assert.equal(armenianTeamName("Egnatia"), "Էգնատիա");
});

test("a doubled Latin consonant is one Armenian letter", () => {
  assert.equal(armenianTeamName("Torreense"), "Տորենսե");
  assert.equal(armenianTeamName("Lincoln Red Imps"), "Լինկոլն Ռեդ Իմպս");
});

test("an acronym is read as an acronym", () => {
  assert.equal(armenianTeamName("AGF"), "ԱԳՖ");
  assert.equal(armenianTeamName("LASK Linz"), "ԼԱՍԿ");
});

test("the affixes are dropped from the display name too", () => {
  assert.equal(armenianTeamName("1. FC Magdeburg"), "Մագդեբուրգ");
  assert.equal(armenianTeamName("Hamburg SV"), "Համբուրգ");
});

test("names whose Armenian is a different word, not a different spelling", () => {
  assert.equal(armenianTeamName("Red Star Belgrade"), "Ցրվենա Զվեզդա");
  assert.equal(armenianTeamName("RB Salzburg"), "Զալցբուրգ");
  assert.equal(armenianTeamName("FC Cologne"), "Քյոլն");
  assert.equal(armenianTeamName("Paris Saint-Germain"), "ՊՍԺ");
  assert.equal(armenianTeamName("Internazionale"), "Ինտեր");
});

test("letters the accent fold does not reach", () => {
  // Danish ø is a letter, not an accented o, so it survived NFD and the board
  // read "Կøբենհավն".
  assert.equal(armenianTeamName("F.C. København"), "Կոպենհագեն");
  assert.equal(armenianTeamName("FC Nordsjælland"), "Նորդշելանդ");
});

test("the Armenian clubs still answer from their own entries", () => {
  assert.equal(armenianTeamName("Ararat-Armenia"), "Արարատ-Արմենիա");
  assert.equal(armenianTeamName("Pyunik"), "Փյունիկ");
  assert.equal(armenianTeamName("Urartu"), "Ուրարտու");
});

test("a national team is a country, not a club", () => {
  assert.equal(armenianTeamName("Spain"), "Իսպանիա");
});

// Two Armenian clubs are filed under names they dropped in 2019, and the
// provider that has the only correct free table uses both. Reading them as
// two different clubs would put twelve rows of a twelve-club league on the
// page with two of them wrong and two missing.
test("a club is one club, whichever of its names arrives", () => {
  assert.equal(armenianTeamName("Banants"), "Ուրարտու");
  assert.equal(armenianTeamName("Banants Yerevan"), "Ուրարտու");
  assert.equal(armenianTeamName("Urartu"), "Ուրարտու");
  assert.equal(armenianTeamName("Artsakh"), "Նոա");
  assert.equal(armenianTeamName("Noah"), "Նոա");
});
