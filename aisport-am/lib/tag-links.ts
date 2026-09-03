// Where an article's tag chip should point.
//
// Every tag linked to /search?q=<tag>. Those pages are now noindex - they
// were the reason 83 pages came back from Google as "duplicate, no
// canonical" - so an article's dozen tag links had become a dozen links
// into pages that lead nowhere for a crawler. Most of the tags are the
// name of a real page on this site: a competition has /league/<code>, a
// sport has /category/<slug>. Pointing them there turns the tag row from
// a dead end into the site's densest piece of internal linking, which is
// what a crawler follows to reach the pages that are not indexed yet.
//
// A tag that matches nothing still goes to search: it is the honest
// destination for "everything we wrote about Mbappe", and noindex+follow
// means the crawler still reads the article links on it.
import { categories } from "./content";
import { LEAGUE_TAGS } from "./league-tags";

function key(value: string): string {
  return value.toLowerCase().replace(/[՝․,։"'«»]/g, "").replace(/\s+/g, " ").trim();
}

const DESTINATIONS = new Map<string, string>();
for (const c of categories) DESTINATIONS.set(key(c.name), `/category/${c.slug}`);
for (const l of LEAGUE_TAGS) DESTINATIONS.set(key(l.label), `/league/${l.code}`);

// The generator does not always write a competition's name the way the nav
// does, and these forms turn up often enough to be worth naming.
for (const [alias, code] of [
  ["անգլիայի պրեմիեր լիգա", "PL"], ["ապլ", "PL"], ["պրեմիեր-լիգա", "PL"],
  ["իսպանիայի լա լիգա", "PD"], ["լալիգա", "PD"],
  ["իտալիայի սերիա ա", "SA"], ["գերմանիայի բունդեսլիգա", "BL1"],
  ["ֆրանսիայի լիգա 1", "FL1"], ["լիգա 1", "FL1"],
  ["ուեֆայի չեմպիոնների լիգա", "CL"], ["չեմպիոնների լիգայի", "CL"],
  ["ուեֆայի եվրոպա լիգա", "EL"], ["եվրոպայի լիգա", "EL"],
  ["սաուդյան արաբիայի պրոֆեսիոնալ լիգա", "SPL"], ["սաուդյան պրո լիգա", "SPL"],
] as const) {
  DESTINATIONS.set(alias, `/league/${code}`);
}

export function tagHref(tag: string): string {
  return DESTINATIONS.get(key(tag)) ?? `/search?q=${encodeURIComponent(tag)}`;
}

// True when the tag reaches a real page rather than a search view. The
// article page uses it to decide whether the link is worth prefetching and
// whether it should carry rel="nofollow" weight - and, more usefully, to
// show the ones that lead somewhere first.
export function tagIsPage(tag: string): boolean {
  return DESTINATIONS.has(key(tag));
}
