// Is this the same story we already published?
//
// Two articles about Manu Koné went out ninety minutes apart, one from Foot
// Mercato and one from Metro. Nothing stopped them: the only check was on
// the source URL, and two outlets reporting the same story have two URLs.
//
// The check that was meant to catch this could not have. It split titles on
// /[^a-z0-9]+/, which treats every Armenian letter as a separator, so an
// Armenian headline produced an empty word set and the comparison returned
// "not a duplicate" every single time. It was also never called from
// anywhere.
//
// This compares what a story is *about* rather than how it is worded: the
// distinctive words of the title and the summary together, cut to a stem so
// that Կոնեի, Կոնեն and Կոնեին count as one word.

// Words that appear in every football story and say nothing about which one
// it is.
const STOPWORDS = new Set([
  "որպես", "համար", "մասին", "հետո", "առաջ", "նաև", "բայց", "սակայն", "որը", "որի",
  "իր", "նրա", "այս", "այդ", "այն", "մեկ", "երկու", "ամեն", "բոլոր", "ինչպես",
  "ըստ", "հետ", "մինչև", "կողմից", "ժամանակ", "տարի", "օրը", "օրվա",
  "ակումբը", "ակումբի", "ակումբին", "թիմը", "թիմի", "թիմին",
  "ֆուտբոլիստը", "ֆուտբոլիստի", "մարզիչը", "մարզչի", "գլխավոր",
  "խաղը", "խաղի", "հանդիպումը", "հանդիպման", "մրցաշրջանում", "մրցաշրջանի",
  "հրապարակման", "աղբյուրների", "փոխանցմամբ", "տեղեկություններով",
  "the", "and", "for", "with", "from", "that", "this", "have", "has", "was", "were",
  "after", "before", "says", "said", "will", "not", "but", "his", "her", "its",
]);

// Enough of a word to identify it, short enough to survive Armenian case
// endings: Կոնեի / Կոնեին / Կոնեն all start with the same five letters.
const STEM_LENGTH = 5;

export function storyStems(...parts: (string | null | undefined)[]): Set<string> {
  const text = parts.filter(Boolean).join(" ");
  const stems = new Set<string>();
  // Letters and digits in any script - the previous version's [a-z0-9]
  // is exactly what made this blind to Armenian.
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue;
    stems.add(raw.slice(0, STEM_LENGTH));
  }
  return stems;
}

/**
 * How much two stories overlap, 0 to 1 (Sørensen–Dice).
 */
export function storyOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const stem of a) if (b.has(stem)) shared++;
  return (2 * shared) / (a.size + b.size);
}

export function sharedStemCount(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const stem of a) if (b.has(stem)) shared++;
  return shared;
}

// Both conditions, deliberately. A high proportion alone fires on two short
// headlines that happen to share a club; a high count alone fires on two
// long pieces that mention the same five players in passing.
//
// The one verified duplicate this was built from - the two Koné pieces -
// scores 0.59 with 11 shared stems, while the next closest pairing among
// that day's other headlines reaches 0.19 with 3. The thresholds sit in
// that gap, closer to the false-positive side on purpose: publishing the
// same story twice is a visible embarrassment, but silently dropping a
// legitimate follow-up (a match preview, then the report) is worse, and
// invisible.
const MIN_OVERLAP = 0.42;
const MIN_SHARED = 6;

export function isSameStory(
  candidate: { title: string; excerpt: string },
  published: { title: string; excerpt: string },
): boolean {
  const a = storyStems(candidate.title, candidate.excerpt);
  const b = storyStems(published.title, published.excerpt);
  return storyOverlap(a, b) >= MIN_OVERLAP && sharedStemCount(a, b) >= MIN_SHARED;
}
