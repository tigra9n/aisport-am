import test from "node:test";
import assert from "node:assert/strict";
import { pickPhoto, squadPhotoKey, readPhotoMaps } from "../lib/espn.ts";

// A Chelsea squad as the two providers spell it. ESPN's roster is on the
// left, TheSportsDB's photo list on the right; every pair below is a real
// disagreement that the old exact-match rule threw away, which is why a
// squad page came back with a third of its faces.
const photos = Object.fromEntries([
  ["Pedro Lomba Neto", "neto.png"],
  ["Joao Pedro Junqueira de Jesus", "joaopedro.png"],
  ["Estevao Willian", "estevao.png"],
  ["Gabriel Magalhaes", "gabriel.png"],
  ["Moises Caicedo", "caicedo.png"],
  ["Reece James", "reece.png"],
  ["Daniel James", "daniel.png"],
].map(([name, url]) => [squadPhotoKey(name), url]));

test("the same name, however it is punctuated", () => {
  assert.equal(pickPhoto(photos, "Gabriel Magalhães"), "gabriel.png");
  assert.equal(pickPhoto(photos, "Moisés Caicedo"), "caicedo.png");
});

test("a shorter spelling inside a longer one", () => {
  assert.equal(pickPhoto(photos, "Pedro Neto"), "neto.png");
  assert.equal(pickPhoto(photos, "João Pedro"), "joaopedro.png");
  assert.equal(pickPhoto(photos, "Estêvão"), "estevao.png");
});

// Two brothers, or two men who share a surname, is exactly the case where a
// wrong face is worse than none: the page would then be telling the reader
// that one footballer is another.
test("an ambiguous surname takes nobody's photograph", () => {
  assert.equal(pickPhoto(photos, "Josh James"), null);
});

test("the surname and the first initial, when only one man fits", () => {
  assert.equal(pickPhoto(photos, "R. James"), "reece.png");
});

test("a name nobody carries stays without a face", () => {
  assert.equal(pickPhoto(photos, "Cole Palmer"), null);
  assert.equal(pickPhoto(photos, ""), null);
});

// A squad of cards should read as one photo session. The provider carries
// portraits on a transparent ground and photographs taken during a match,
// and the two do not sit together - so a stored map keeps them apart, and
// an older flat map is read as portraits, which is what it mostly held.
test("a stored map is read whichever shape it is in", () => {
  const shaped = readPhotoMaps({ cut: { a: "cut.png" }, alt: { b: "match.jpg" } });
  assert.deepEqual(shaped, { cut: { a: "cut.png" }, alt: { b: "match.jpg" } });

  const flat = readPhotoMaps({ a: "old.png" });
  assert.deepEqual(flat, { cut: { a: "old.png" }, alt: {} });

  assert.deepEqual(readPhotoMaps({ cut: { a: "c.png" } }), { cut: { a: "c.png" }, alt: {} });
});
