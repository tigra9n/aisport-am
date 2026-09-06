import test from "node:test";
import assert from "node:assert/strict";
import { armenianPlayerName } from "../lib/player-names-hy.ts";
import { transliterateName } from "../lib/translit-hy.ts";

// The worst thing this file can do is not spell a name awkwardly - it is
// print one footballer under another man's name. The surname fallback was
// written for the abbreviations the paid provider sends ("B. Fernandes"),
// and it was matching full names too: the table holds one Martinez, so
// Aston Villa's goalkeeper appeared on a squad page as Inter's striker.
test("a full name is never given somebody else's surname spelling", () => {
  assert.equal(armenianPlayerName("Emiliano Martinez"), "Էմիլիանո Մարտինես");
  assert.equal(armenianPlayerName("Lautaro Martinez"), "Լաուտարո Մարտինես");
  // Nobody of this name plays: the point is that he does not become Harry
  // Kane, which is what the table's single "kane" used to do to every man
  // who shares the surname.
  assert.equal(armenianPlayerName("Josh Kane"), "Ջոշ Կանե");
});

test("an abbreviated first name still finds its man", () => {
  assert.equal(armenianPlayerName("E. Haaland"), "Էրլինգ Հալանդ");
  assert.equal(armenianPlayerName("B. Fernandes"), "Բրունո Ֆերնանդեշ");
  assert.equal(armenianPlayerName("L. Martinez"), "Լաուտարո Մարտինես");
});

// ...and the initial has to agree. An abbreviation that names a different
// man is the same fault in smaller print.
test("an abbreviation with the wrong initial finds nobody", () => {
  assert.notEqual(armenianPlayerName("E. Martinez"), "Լաուտարո Մարտինես");
});

// English is the language the letter-by-letter rule punishes hardest, and
// these are what a Premier League squad list actually produced.
test("the English names the rule could not have guessed", () => {
  assert.equal(armenianPlayerName("Reece James"), "Ռիս Ջեյմս");
  assert.equal(armenianPlayerName("Sean Longstaff"), "Շոն Լոնգսթաֆ");
  assert.equal(armenianPlayerName("Nick Pope"), "Նիկ Փոուփ");
  assert.equal(armenianPlayerName("Ben White"), "Բեն Ուայթ");
});

// Spanish and Portuguese -ez is ս, and the table said so by hand for some
// men and left the rule to write զ for the rest.
test("a surname in -ez ends in ս", () => {
  assert.equal(armenianPlayerName("Enzo Fernandez"), "Էնզո Ֆերնանդես");
  assert.equal(armenianPlayerName("Robert Sanchez"), "Ռոբերտ Սանչես");
});

// Rules, not table entries: these have to work for the hundreds of squad
// players nobody will ever write out by hand.
test("wh is one sound, and h is not part of it", () => {
  assert.equal(transliterateName("Adam Wharton"), "Ադամ Ուարտոն");
  // w on its own stays վ, because Polish and German say it that way.
  assert.equal(transliterateName("Robert Lewandowski"), "Ռոբերտ Լեվանդովսկի");
});

test("Portuguese nh and lh, and Italian gli", () => {
  assert.equal(transliterateName("Savinho"), "Սավինյո");
  assert.equal(transliterateName("Carvalho"), "Կարվալյո");
  assert.equal(transliterateName("Guglielmo Vicario"), "Գուլյելմո Վիկարիո");
  // Only before i: an English word with gl is untouched.
  assert.equal(transliterateName("Gloria Inglese"), "Գլորիա Ինգլեսե");
});

// MEASURED on 6 September, by running every roster the site reads through
// these two functions: 4330 footballers, 93 of them named by the table and
// 4237 spelled out by rule. Reading the rules' own work is what found
// these; each one was damaging names in a language the digraph was never
// written for.
test("nh and lh are Portuguese, not Arabic or German", () => {
  // Half a Saudi league is written "al-" and German joins whole words, so
  // the pair falls in the middle of names that say both letters.
  assert.equal(transliterateName("Rahim Alhassane"), "Ռահիմ Ալհասանե");
  assert.equal(transliterateName("Abdelhamid Ait Boudlal"), "Աբդելհամիդ Աիտ Բուդլալ");
  assert.equal(transliterateName("Philipp Lienhart"), "Ֆիլիպ Լիենհարտ");
  // What Portuguese does and those do not: a vowel right after it, at the
  // end of the word.
  assert.equal(transliterateName("Matheus Cunha"), "Մաթեուս Կունյա");
  assert.equal(transliterateName("Coutinho"), "Կուտինյո");
});

test("Italian gli takes a vowel after it", () => {
  // Georgian, and it was coming out Գոլյչիդզե.
  assert.equal(transliterateName("Saba Goglichidze"), "Սաբա Գոգլիչիդզե");
});

test("Italian cch is one hard k", () => {
  assert.equal(transliterateName("Marco Carnesecchi"), "Մարկո Կարնեսեկի");
});

// Latin letters standing in the middle of an Armenian word: stripping the
// accents never reached these, because they are not a letter with an
// accent on top.
test("the letters that are not an accented letter", () => {
  assert.equal(transliterateName("Christian Nørgaard"), "Քրիստիան Նորգարդ");
  assert.equal(transliterateName("Fernando Niño"), "Ֆերնանդո Նինյո");
  assert.equal(transliterateName("Daniel Bragança"), "Դանիել Բրագանսա");
});
