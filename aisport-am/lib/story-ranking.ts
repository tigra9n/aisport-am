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

export type RankedStory = {
  item: FeedItem;
  sourceName: string;
  // How many other desks are carrying what looks like the same story.
  corroboration: number;
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

// Two distinctive words in common. "haala" plus "city" is the same story;
// "haala" alone could be any of a dozen Haaland pieces.
const MIN_SHARED_DISTINCTIVE = 2;

// Rolling pages, not articles. Their text changes under you all evening, so
// whatever the model is handed will not be what the link shows an hour
// later - and the headline is never about one thing anyway.
// The continental papers mark them in their own languages, and they were
// in the first sample each one returned: RMC led with "DIRECT.
// Nice-Le Mans", Record with "Roma-Atalanta, em direto".
const ROLLING_PAGE = /\bliveblog\b|\blive blog\b|LIVE[!:]|\bas it happened\b|minute-by-minute|\bDIRECT\.|\ben direct\b|\bem direto\b|\ben directo\b|\bEN VIVO\b|\bin diretta\b|\bLIVETICKER\b|\bliveticker\b/i;

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

  type Entry = { item: FeedItem; sourceName: string; stems: string[] };
  const entries: Entry[] = [];
  let quiet = 0;
  for (const { source, items } of fetched) {
    if (!items.length) quiet++;
    for (const item of items) {
      if (ROLLING_PAGE.test(item.title)) continue;
      entries.push({ item, sourceName: source.name, stems: [...storyStems(item.title)] });
    }
  }
  log.push(`ranking: ${entries.length} stories from ${window.length - quiet} of ${window.length} feeds`);
  if (entries.length < 2) return entries.map((e) => ({ item: e.item, sourceName: e.sourceName, corroboration: 0, alsoIn: [] }));

  const frequency = new Map<string, number>();
  for (const entry of entries) for (const stem of entry.stems) frequency.set(stem, (frequency.get(stem) ?? 0) + 1);
  const commonAbove = Math.max(3, Math.ceil(entries.length * COMMON_STEM_SHARE));

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
    return { item: entry.item, sourceName: entry.sourceName, corroboration: desks.size, alsoIn: [...desks] };
  });

  ranked.sort((a, b) => {
    if (b.corroboration !== a.corroboration) return b.corroboration - a.corroboration;
    // Among equally corroborated stories, prefer one that comes with a
    // picture - the alternative is a category stock photo - and then the
    // newer one.
    const picture = Number(Boolean(b.item.imageUrl)) - Number(Boolean(a.item.imageUrl));
    if (picture !== 0) return picture;
    return (Date.parse(b.item.pubDate ?? "") || 0) - (Date.parse(a.item.pubDate ?? "") || 0);
  });

  const top = ranked.slice(0, 3).map((r) => `${r.corroboration} desks: ${r.item.title.slice(0, 60)}`);
  for (const line of top) log.push(`ranking: ${line}`);
  return ranked;
}
