// How long an article actually takes to read.
//
// Every article, card and hero slide used to claim "3 րոպե" - the same
// number on all 336 of them, which tells the reader nothing and is simply
// wrong for the long pieces.
//
// 180 words a minute is a conservative rate for reading Armenian prose;
// English-language research usually lands between 200 and 250 for
// on-screen reading, and Armenian words are longer.
const WORDS_PER_MINUTE = 180;

export function readingMinutes(text: string | null | undefined): number {
  if (!text) return 1;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // Never zero: a two-sentence note still costs the reader a moment.
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function readTimeLabel(text: string | null | undefined): string {
  return `${readingMinutes(text)} րոպե`;
}
