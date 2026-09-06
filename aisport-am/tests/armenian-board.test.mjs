import test from "node:test";
import assert from "node:assert/strict";
import { readScore, readStatus } from "../lib/highlightly.ts";

// Highlightly's fixture row was measured on 6 September, but the probe
// printed state.score as an object without opening it - the shape was cut
// off at two levels deep. Rather than guess one spelling and put a wrong
// score on the board, the reader accepts the ones an API of this shape
// uses. These pin all of them, so that when the real one is known the
// others can be deleted knowingly rather than by accident.
test("the score is read whichever way it is spelled", () => {
  assert.deepEqual(readScore({ home: 2, away: 1 }), { home: 2, away: 1 });
  assert.deepEqual(readScore({ current: "2 - 1" }), { home: 2, away: 1 });
  assert.deepEqual(readScore({ current: "2-1" }), { home: 2, away: 1 });
  assert.deepEqual(readScore({ current: { home: 2, away: 1 } }), { home: 2, away: 1 });
  assert.deepEqual(readScore({ fullTime: { home: 0, away: 0 } }), { home: 0, away: 0 });
  assert.deepEqual(readScore({ total: { home: "3", away: "0" } }), { home: 3, away: 0 });
});

test("nothing readable is no score, not nil-nil", () => {
  assert.deepEqual(readScore(null), { home: null, away: null });
  assert.deepEqual(readScore({}), { home: null, away: null });
  assert.deepEqual(readScore({ current: "vs" }), { home: null, away: null });
});

// "Not started" is the one description read from the live API, at 14:49
// UTC on 6 September for a 15:00 kick-off. The rest are the vocabulary an
// API of this shape uses; each is matched loosely because the exact casing
// is not known.
const kickoff = new Date("2026-09-06T15:00:00.000Z");

test("a match that has not started shows its kick-off time, not a score", () => {
  const state = readStatus({ description: "Not started", clock: null }, kickoff);
  assert.equal(state.isLive, false);
  assert.equal(state.finished, false);
  // 15:00 UTC is 19:00 in Yerevan.
  assert.match(state.status, /19[:.]00/);
});

test("the minute is the minute", () => {
  assert.deepEqual(readStatus({ description: "2nd Half", clock: 67 }, kickoff), { status: "67′", isLive: true, finished: false });
  assert.deepEqual(readStatus({ description: "1st Half", clock: "23" }, kickoff), { status: "23′", isLive: true, finished: false });
});

test("half time and full time are said in Armenian", () => {
  assert.deepEqual(readStatus({ description: "Half Time", clock: 45 }, kickoff), { status: "Ընդմիջում", isLive: true, finished: false });
  assert.deepEqual(readStatus({ description: "Finished", clock: null }, kickoff), { status: "Ավարտված", isLive: false, finished: true });
  assert.deepEqual(readStatus({ description: "Match Finished", clock: 90 }, kickoff), { status: "Ավարտված", isLive: false, finished: true });
});

// A postponed match with a kick-off time in the past would otherwise sit on
// the board looking like it is about to start.
test("postponed and cancelled are not times", () => {
  assert.equal(readStatus({ description: "Postponed" }, kickoff).status, "Հետաձգված");
  assert.equal(readStatus({ description: "Cancelled" }, kickoff).status, "Չեղարկված");
});

// And if it is spelled some way nobody guessed, anything score-shaped
// inside beats a blank beside a 67th minute.
test("a score buried anywhere is still found", () => {
  assert.deepEqual(readScore({ periods: { regular: { homeGoals: 1, awayGoals: 4 } } }), { home: 1, away: 4 });
  assert.deepEqual(readScore({ result: { display: "3 - 2" } }), { home: 3, away: 2 });
});
