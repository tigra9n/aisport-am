// Latin -> Armenian transliteration for names the table does not carry.
//
// The squad list for Manchester City showed 23 of its 26 players in Latin:
// a hand-written table can hold the well-known names, but not twenty-six
// players for every club in every league. On an Armenian site that reads as
// unfinished, and a reader who does not read Latin script cannot use the
// page at all.
//
// So this is a fallback, never a first choice: armenianPlayerName still
// answers from the table first, and only a name that is not there is
// spelled out by rule. It will not always match how a commentator says the
// name - "Bettinelli" comes out "Բետտինելի" - but an approximate Armenian
// spelling is more use to the reader than Latin, and any name worth getting
// exactly right can be added to the table, which always wins.
//
// Two Armenian spelling rules the mapping has to respect:
//   - a word-initial "ե" is read "ye", so a name starting with E takes "է"
//   - a word-initial "ո" is read "vo", so a name starting with O takes "օ"

const DIGRAPHS: [string, string][] = [
  // "ch" before a consonant is the Greek/Latin hard one - Christian, not
  // Chelsea - and Armenian writes that with ք.
  ["chr", "քր"],
  ["chl", "քլ"],
  ["sch", "շ"],
  ["tch", "չ"],
  ["ch", "չ"],
  ["sh", "շ"],
  ["zh", "ժ"],
  ["kh", "խ"],
  ["ph", "ֆ"],
  ["th", "թ"],
  ["gh", "գ"],
  ["ck", "կ"],
  ["qu", "կվ"],
  // MEASURED against a Premier League squad list: "wh" was coming out as
  // "վհ" - Ben White as Բեն Վհիտե, Adam Wharton as Ադամ Վհարտոն. English is
  // the only language that spells the sound this way and the h is silent in
  // all of it, so the pair is one letter. "w" alone is left as վ, because
  // Polish and German say it that way and Լևանդովսկի is right.
  ["wh", "ու"],
  // Italian doubles the c before a front vowel and the h only says the c
  // stays hard: Carnesecchi is Կարնեսեկի, not Կարնեսեկհի, which is what
  // reading "cc" and then "ch" produced. Both spellings are Italian and
  // nothing else spells a name this way.
  ["cch", "կ"],
  ["cci", "չի"],
  ["ou", "ու"],
  ["oo", "ու"],
  ["ee", "ի"],
  // Dutch and Norwegian double vowels are one sound: Haaland, Maarten.
  ["aa", "ա"],
  // Doubled consonants say nothing extra in Armenian, and "zz" is the
  // Italian "ts".
  ["zz", "ց"],
  ["ll", "լ"],
  ["nn", "ն"],
  ["tt", "տ"],
  ["ss", "ս"],
  ["mm", "մ"],
  ["pp", "պ"],
  ["ff", "ֆ"],
  ["rr", "ռ"],
  ["cc", "կ"],
  ["dd", "դ"],
  ["gg", "գ"],
  ["bb", "բ"],
];

const LETTERS: Record<string, string> = {
  a: "ա", b: "բ", d: "դ", e: "ե", f: "ֆ", g: "գ", h: "հ", i: "ի",
  j: "ջ", k: "կ", l: "լ", m: "մ", n: "ն", o: "ո", p: "պ", q: "կ",
  r: "ր", s: "ս", t: "տ", u: "ու", v: "վ", w: "վ", x: "քս", y: "ի", z: "զ",
};

function transliterateWord(word: string): string {
  let rest = word;
  let out = "";
  let atStart = true;

  while (rest.length > 0) {
    // Portuguese writes the palatal n and l as nh and lh - Savinho,
    // Carvalho, Cunha - and Italian writes the same l as gli. Read letter
    // by letter they became Սավինհո and Կարվալհո, which is why every one
    // of them had to be spelled by hand in the table.
    //
    // MEASURED, and the reason these are not in the plain digraph list:
    // the pair occurs in other languages where it is two sounds, and the
    // rule was damaging more names than it repaired - Alhassane became
    // Ալյասանե, Abdelhamid Աբդելյամիդ, Lienhart Լիենյարտ, and the Georgian
    // Goglichidze Գոլյչիդզե. Arabic writes "al-" in front of half of a
    // Saudi league and German joins whole words together.
    //
    // What Portuguese does and the others do not: the digraph is followed
    // by a vowel that all but ends the word - Cunha, Savinho, Carvalho,
    // Marquinhos, Coutinho. Italian gli is followed by a vowel too, where
    // Goglichidze has a consonant after it.
    if (rest.startsWith("nh") || rest.startsWith("lh")) {
      const after = rest.slice(2);
      if ("aeiou".includes(after[0] ?? "") && after.length <= 2) {
        out += rest[0] === "n" ? "նյ" : "լյ";
        rest = after;
        atStart = false;
        continue;
      }
    }
    if (rest.startsWith("gli") && "aeou".includes(rest[3] ?? "")) {
      out += "լյ";
      rest = rest.slice(3);
      atStart = false;
      continue;
    }

    // A digraph first, longest ones before shorter: "sch" must not be read
    // as "sc" + "h".
    const digraph = DIGRAPHS.find(([latin]) => rest.startsWith(latin));
    if (digraph) {
      out += digraph[1];
      rest = rest.slice(digraph[0].length);
      atStart = false;
      continue;
    }

    const letter = rest[0];
    const next = rest[1] ?? "";

    if (letter === "c") {
      // Soft before e/i/y, hard elsewhere - the split every Romance
      // language shares. `next` is empty at the end of a word, and an
      // empty string is "included" in anything, so test for it first.
      out += next !== "" && "eiy".includes(next) ? "ս" : "կ";
    } else if (letter === "r" && atStart) {
      // Armenian has two r's, and a name opens with the rolled one:
      // Ռոնալդու, Ռոդրի, Ռուբեն.
      out += "ռ";
    } else if (letter === "e") {
      out += atStart ? "է" : "ե";
    } else if (letter === "o") {
      out += atStart ? "օ" : "ո";
    } else if (letter === "y") {
      // A consonant next to a vowel - Yamal, Oyarzabal, Reyna - and the
      // vowel "i" between consonants: Kylian, Szczesny.
      const previous = out.slice(-1);
      const touchesVowel = "աեէիոօու".includes(previous) || (next !== "" && "aeiou".includes(next));
      out += atStart || touchesVowel ? "յ" : "ի";
    } else if (LETTERS[letter]) {
      out += LETTERS[letter];
    } else {
      // Hyphens, apostrophes, full stops in initials: keep them as they are.
      out += letter;
    }
    rest = rest.slice(1);
    atStart = false;
  }

  return out;
}

/**
 * "M. Bettinelli" -> "Մ. Բետտինելի". Returns null when the input is not a
 * Latin-script name (already Armenian, or empty), so the caller can leave
 * it alone.
 */
export function transliterateName(name: string | null | undefined): string | null {
  if (!name) return null;
  const plain = name
    // Letters that are not an accent on top of a letter, so stripping
    // accents does not reach them and they come out untouched: Christian
    // Nørgaard was printed "Քրիստիան Նørգարդ" on a squad page, Latin
    // letters standing in the middle of an Armenian word.
    //
    // The two with a sound of their own are done here rather than in the
    // letter table, because they are two Armenian letters each and the
    // table maps one at a time: Spanish and Portuguese ñ is the same
    // palatal n as Portuguese nh (Niño -> Նինյո), and ç is s in every
    // language that writes it (Bragança -> Բրագանսա) where the bare c it
    // decomposes to would have come out կ.
    .replace(/ñ/g, "ny").replace(/Ñ/g, "Ny")
    .replace(/ç/g, "s").replace(/Ç/g, "S")
    .replace(/[øØ]/g, "o").replace(/[åÅ]/g, "a")
    .replace(/æ/g, "ae").replace(/Æ/g, "Ae")
    .replace(/œ/g, "oe").replace(/Œ/g, "Oe")
    .replace(/ß/g, "ss").replace(/[łŁ]/g, "l")
    .replace(/[đðĐÐ]/g, "d").replace(/[þÞ]/g, "th")
    .replace(/[ıİ]/g, "i").replace(/[ŋŊ]/g, "ng")
    // Accents carry pronunciation this mapping cannot express, so they are
    // reduced to the base letter rather than guessed at.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .trim();
  if (!/[a-zA-Z]/.test(plain)) return null;

  return plain
    .split(/\s+/)
    .map((word) =>
      // Both halves of a double-barrelled name are capitalised: Aït-Nouri,
      // not Aït-nouri. Armenian has its own capitals and toUpperCase knows
      // the pairs.
      word
        .split("-")
        .map((part) => {
          const armenian = transliterateWord(part.toLowerCase());
          return armenian.charAt(0).toUpperCase() + armenian.slice(1);
        })
        .join("-"),
    )
    .join(" ");
}
