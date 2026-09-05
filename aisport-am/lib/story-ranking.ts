// Which of tonight's thousand stories is worth one of the seventeen slots?
//
// Until now: none of them, in the sense that nobody chose. The cron route
// took the first source in a rotation and the first item in it that had not
// been published yet. With one source that was the only thing it could do.
// With thirty-six it means the site writes about whatever Birmingham Live
// happened to post four minutes ago, while the story every desk in England
// is leading with goes unwritten.
//
// RSS carries no read counts - no feed publishes them - so "most read"
// cannot be measured directly. What can be measured is better anyway, and
// it is what a newsroom actually watches: how many independent desks
// decided the same story was worth writing. Nine outlets on one transfer is
// the story of the hour. One outlet on it is that outlet's choice.
//
// The comparison reuses lib/story-signature.ts, written to catch the site
// publishing the same story twice. Same question, opposite sign: there it
// asks "have we said this already", here it asks "who else is saying it".
import { fetchFeed, type FeedItem } from "./feeds";
import { storyStems } from "./story-signature";


// Which country's press a desk belongs to.
//
// Twenty-five of the desks are English and six are Spanish, so counting
// desks alone would hand every hour to the Premier League by arithmetic
// rather than by news judgement: a La Liga story every Spanish paper is
// leading with can be corroborated six times at most, while a mid-table
// English story reaches eight without being the bigger story. The count is
// therefore taken as a share of the desks that cover that country at all,
// which is what makes "four of the six Spanish papers" beat "eight of the
// twenty-five English ones".
const BEATS: [RegExp, string][] = [
  [/marca|as\.com|mundodeportivo|sport\.es|football-espana|barcauniversal|madriduniversal|laliga/i, "Spain"],
  [/gazzetta|corrieredellosport|tuttosport|football-italia|calciomercato|tuttomercatoweb/i, "Italy"],
  [/lequipe|rmcsport|bfmtv|getfootballnewsfrance|sofoot|ligue1/i, "France"],
  [/bundesliga\.com|bulinews|kicker|getgermanfootballnews/i, "Germany"],
  [/turkish-football/i, "Turkey"],
  [/record\.pt|abola|portugoal/i, "Portugal"],
];

export function beatOf(feedUrl: string): string {
  for (const [pattern, beat] of BEATS) if (pattern.test(feedUrl)) return beat;
  // Everything else is the English-language press. Not all of it is
  // English - Ireland, the United States - but it reports the same beat
  // and competes for the same slot.
  return "England";
}

export type RankedStory = {
  item: FeedItem;
  sourceName: string;
  beat: string;
  // How many other desks are carrying what looks like the same story.
  corroboration: number;
  // The count after the smaller presses are scaled up to compete.
  weight: number;
  alsoIn: string[];
};

// Thirty-six feeds is thirty-six subrequests before generation has made a
// single call of its own, and a Worker invocation has a ceiling on those.
// Twenty-four leaves comfortable headroom for the article page, the image
// check, the model call and the social posts, and still gathers around six
// hundred candidate stories - far more than enough for a consensus to be
// visible. The window rotates so no feed is permanently outside it.
const MAX_FEEDS_PER_TICK = 24;
const ITEMS_PER_FEED = 25;

// A stem carried by more than this share of everything gathered says
// nothing about which story an item is: "leagu", "footb", "premi" and
// "unite" are in hundreds of headlines on any given evening. Only the rare
// words identify an event.
const COMMON_STEM_SHARE = 0.12;
// ...but a share alone collapses on a small pool. On a normal tick around
// five hundred stories are gathered and the cutoff lands near sixty; on a
// bad night when three feeds answer, a bare share would call any word in
// four headlines common, which is every club name in the sample. Tested:
// with fourteen headlines and no floor, "city" appeared in seven and was
// discarded as meaningless, leaving the story six desks were leading with
// tied against a Wolves retrospective.
const COMMON_STEM_FLOOR = 8;

// Two distinctive words in common. "haala" plus "city" is the same story;
// "haala" alone could be any of a dozen Haaland pieces.
const MIN_SHARED_DISTINCTIVE = 2;

// How far a smaller press may be scaled up to compete with the largest.
//
// Dividing by the size of the country's press outright looked right and was
// wrong, which the tests caught: a country with one desk in the gathering
// scores one of one, a perfect share, and a single Barcelona blog outranks
// the story six English desks are leading with. Scaling the count instead,
// and capping the scale, keeps both halves true - four of six Spanish
// papers (4 x 1.5 = 6) beats five of twenty-five English ones (5 x 1 = 5),
// while one desk of one (1 x 3 = 3) still loses to three desks of ten.
const MAX_SMALL_PRESS_BOOST = 3;

// Rolling pages, not articles. Their text changes under you all evening, so
// whatever the model is handed will not be what the link shows an hour
// later - and the headline is never about one thing anyway.
// The continental papers mark them in their own languages, and they were
// in the first sample each one returned: RMC led with "DIRECT.
// Nice-Le Mans", Record with "Roma-Atalanta, em direto".
const ROLLING_PAGE = /\bliveblog\b|\blive blog\b|LIVE[!:]|\bas it happened\b|minute-by-minute|\bDIRECT\.|\ben direct\b|\bem direto\b|\ben directo\b|\bEN VIVO\b|\bin diretta\b|\bLIVETICKER\b|\bliveticker\b/i;

export type GatheredStory = { item: FeedItem; sourceName: string; beat: string };

export async function rankStories(
  sources: { name: string; feedUrl: string }[],
  log: string[],
): Promise<RankedStory[]> {
  if (!sources.length) return [];

  // Rotate the window rather than always reading the same twenty-four.
  const tick = Math.floor(Date.now() / (5 * 60 * 1000));
  const offset = tick % sources.length;
  const window = [...sources.slice(offset), ...sources.slice(0, offset)].slice(0, MAX_FEEDS_PER_TICK);

  const fetched = await Promise.all(
    window.map(async (source) => ({ source, items: await fetchFeed(source.feedUrl, ITEMS_PER_FEED) })),
  );

  const gathered: GatheredStory[] = [];
  let quiet = 0;
  for (const { source, items } of fetched) {
    if (!items.length) quiet++;
    for (const item of items) gathered.push({ item, sourceName: source.name, beat: beatOf(source.feedUrl) });
  }
  log.push(`ranking: ${gathered.length} stories from ${window.length - quiet} of ${window.length} feeds`);
  const ranked = rankGathered(gathered);
  for (const story of ranked.slice(0, 3)) log.push(`ranking: ${story.corroboration} desks: ${story.item.title.slice(0, 60)}`);
  return ranked;
}

// The judgement, separated from the fetching so it can be exercised
// without a network - what this gets wrong is not which feeds answered but
// which headlines it decides are the same story.
export function rankGathered(gathered: GatheredStory[]): RankedStory[] {
  type Entry = { item: FeedItem; sourceName: string; beat: string; stems: string[] };
  const entries: Entry[] = [];
  for (const { item, sourceName, beat } of gathered) {
    if (ROLLING_PAGE.test(item.title)) continue;
    entries.push({ item, sourceName, beat, stems: [...storyStems(item.title)] });
  }
  if (entries.length < 2) {
    return entries.map((e) => ({ item: e.item, sourceName: e.sourceName, beat: e.beat, corroboration: 0, weight: 0, alsoIn: [] }));
  }

  // How many desks each country has in tonight's gathering, so a count can
  // be read against the number of desks that could have carried it.
  const desksPerBeat = new Map<string, Set<string>>();
  const beatByDesk = new Map<string, string>();
  for (const entry of entries) {
    const set = desksPerBeat.get(entry.beat) ?? new Set<string>();
    set.add(entry.sourceName);
    desksPerBeat.set(entry.beat, set);
    beatByDesk.set(entry.sourceName, entry.beat);
  }
  const largestBeat = Math.max(...[...desksPerBeat.values()].map((set) => set.size), 1);

  const frequency = new Map<string, number>();
  for (const entry of entries) for (const stem of entry.stems) frequency.set(stem, (frequency.get(stem) ?? 0) + 1);
  const commonAbove = Math.max(COMMON_STEM_FLOOR, Math.ceil(entries.length * COMMON_STEM_SHARE));

  // An inverted index over the distinctive stems only. Comparing every
  // headline with every other would be several hundred thousand set
  // intersections inside a request that has a deadline; this touches only
  // the handful of headlines that share a rare word.
  const postings = new Map<string, number[]>();
  const distinctive: string[][] = entries.map((entry, index) => {
    const rare = entry.stems.filter((stem) => (frequency.get(stem) ?? 0) <= commonAbove);
    for (const stem of rare) {
      const list = postings.get(stem);
      if (list) list.push(index); else postings.set(stem, [index]);
    }
    return rare;
  });

  const ranked: RankedStory[] = entries.map((entry, index) => {
    const shared = new Map<number, number>();
    for (const stem of distinctive[index]) {
      for (const other of postings.get(stem) ?? []) {
        if (other !== index) shared.set(other, (shared.get(other) ?? 0) + 1);
      }
    }
    const desks = new Set<string>();
    for (const [other, count] of shared) {
      if (count >= MIN_SHARED_DISTINCTIVE && entries[other].sourceName !== entry.sourceName) {
        desks.add(entries[other].sourceName);
      }
    }
    // The desk itself counts towards its own country's tally: one of the
    // six Spanish papers carrying a story is one of six, not none of six.
    const own = Math.max(desksPerBeat.get(entry.beat)?.size ?? 1, 1);
    const withinBeat = [...desks].filter((name) => beatByDesk.get(name) === entry.beat).length + 1;
    return {
      item: entry.item,
      sourceName: entry.sourceName,
      beat: entry.beat,
      corroboration: desks.size,
      weight: withinBeat * Math.min(MAX_SMALL_PRESS_BOOST, largestBeat / own),
      alsoIn: [...desks],
    };
  });

  ranked.sort((a, b) => {
    // Weight first, raw count second.
    const weightGap = Math.round(b.weight * 100) - Math.round(a.weight * 100);
    if (weightGap !== 0) return weightGap;
    if (b.corroboration !== a.corroboration) return b.corroboration - a.corroboration;
    // Among equally corroborated stories, prefer one that comes with a
    // picture - the alternative is a category stock photo - and then the
    // newer one.
    const picture = Number(Boolean(b.item.imageUrl)) - Number(Boolean(a.item.imageUrl));
    if (picture !== 0) return picture;
    return (Date.parse(b.item.pubDate ?? "") || 0) - (Date.parse(a.item.pubDate ?? "") || 0);
  });

  return ranked;
}
