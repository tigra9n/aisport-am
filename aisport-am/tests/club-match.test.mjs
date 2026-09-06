import test from "node:test";
import assert from "node:assert/strict";
import { chooseAthlete, chooseClub, surnameOf, surnameSet } from "../lib/club-match.ts";

const squad = (...names) => surnameSet(names);
const club = (id, name, ...names) => ({ id, name, squad: squad(...names) });

// The two providers write the same footballer differently. Only the
// family name survives both, which is the whole reason the comparison is
// on last tokens.
test("the family name is what both providers agree on", () => {
  assert.equal(surnameOf("Bobby Decordova-Reid"), "reid");
  assert.equal(surnameOf("Gabriel Magalhães"), "magalhaes");
  assert.equal(surnameOf("R. James"), "james");
  // Too short to prove anything: an initial that lost its full stop, or a
  // name half a league also has two letters of.
  assert.equal(surnameOf("Demba Ba"), "");
  assert.equal(surnameOf(""), "");
});

const arsenal = ["Raya", "Saliba", "Gabriel Magalhães", "Rice", "Ødegaard", "Saka", "Havertz", "Timber"];

test("the right club, proved by its own squad", () => {
  const verdict = chooseClub(squad(...arsenal), [
    club("359", "Arsenal", "Raya", "Saliba", "Gabriel Magalhaes", "Rice", "Odegaard", "Saka"),
    club("363", "Chelsea", "Sánchez", "Colwill", "Caicedo", "Palmer", "Jackson"),
    club("360", "Aston Villa", "Martínez", "Konsa", "Torres", "McGinn", "Watkins"),
  ]);
  assert.equal(verdict?.id, "359");
  assert.ok(verdict.shared >= 4);
});

// The case a name matcher gets wrong and a squad matcher does not: the
// names share one word out of two and nothing else.
test("a name that barely matches is still matched by its players", () => {
  const united = ["Onana", "Maguire", "Shaw", "Fernandes", "Mount", "Højlund"];
  const verdict = chooseClub(squad(...united), [
    club("360", "Man United", "Onana", "Maguire", "Shaw", "Fernandes", "Mount"),
    club("382", "Manchester City", "Ederson", "Dias", "Rodri", "Foden", "Haaland"),
  ]);
  assert.equal(verdict?.id, "360");
});

// Everything below is a refusal, and every one of them is the point of
// the file: a wrong row here sends an already-indexed page to another club.
test("three shared names is chance, not proof", () => {
  const verdict = chooseClub(squad("Silva", "Fernandez", "Santos", "Rodriguez"), [
    club("1", "Some Club", "Silva", "Fernandez", "Santos", "Nobody"),
  ]);
  assert.equal(verdict, null);
});

test("a tie is not an answer", () => {
  const ours = squad("Raya", "Saliba", "Rice", "Saka", "Timber");
  const verdict = chooseClub(ours, [
    club("a", "Club A", "Raya", "Saliba", "Rice", "Saka"),
    club("b", "Club B", "Raya", "Saliba", "Rice", "Saka"),
  ]);
  assert.equal(verdict, null);
});

test("a club with no published squad proves nothing", () => {
  assert.equal(chooseClub(squad("Raya", "Saka"), [club("a", "Club A", "Raya", "Saka")]), null);
  assert.equal(chooseClub(squad(...arsenal), []), null);
});

test("no overlap at all is no match, not the least-bad one", () => {
  const verdict = chooseClub(squad(...arsenal), [
    club("363", "Chelsea", "Sánchez", "Colwill", "Caicedo", "Palmer", "Jackson"),
  ]);
  assert.equal(verdict, null);
});

// ---------------------------------------------------------------------
// And the same question about a footballer
// ---------------------------------------------------------------------

const athlete = (id, name, team) => ({ id, name, team });

test("one name that can only mean one footballer", () => {
  const found = chooseAthlete("Մոհամեդ Սալահ", [
    athlete("1", "Մոհամեդ Սալահ", "Լիվերպուլ"),
    athlete("2", "Բուկայո Սակա", "Արսենալ"),
  ]);
  assert.equal(found?.id, "1");
});

// The providers disagree on given names far more than on family names.
test("the family name carries when the given name does not", () => {
  const found = chooseAthlete("Բոբի Ռեյդ", [
    athlete("1", "Բոբի Դեկորդովա-Ռեյդ", "Ֆուլհեմ"),
    athlete("2", "Իլյա Զաբարնի", "Բորնմութ"),
  ]);
  assert.equal(found?.id, "1");
});

// The refusals. A wrong row here is a permanent redirect telling a reader
// that one footballer is another.
test("a shared family name is not an answer", () => {
  const found = chooseAthlete("Ջեյմս", [
    athlete("1", "Ռիս Ջեյմս", "Չելսի"),
    athlete("2", "Դանիել Ջեյմս", "Լիդս"),
  ]);
  assert.equal(found, null);
});

test("the club separates two men who share a family name", () => {
  const found = chooseAthlete("Ջեյմս", [
    athlete("1", "Ռիս Ջեյմս", "Չելսի"),
    athlete("2", "Դանիել Ջեյմս", "Լիդս"),
  ], "Չելսի");
  assert.equal(found?.id, "1");
});

test("a club that separates nobody still refuses", () => {
  const found = chooseAthlete("Ջեյմս", [
    athlete("1", "Ռիս Ջեյմս", "Չելսի"),
    athlete("2", "Դանիել Ջեյմս", "Չելսի"),
  ], "Չելսի");
  assert.equal(found, null);
});

test("nothing to go on is no match", () => {
  assert.equal(chooseAthlete("", [athlete("1", "Ռիս Ջեյմս")]), null);
  assert.equal(chooseAthlete("Ռիս Ջեյմս", []), null);
  assert.equal(chooseAthlete("Ա", [athlete("1", "Ա")]), null);
});
