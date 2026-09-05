// Which internal links a crawler should not spend its budget on.
//
// Cloudflare's crawler report, 5 September: of 1,230 requests from named
// crawlers in a day, /search was the single most-fetched path with 278 -
// nearly a quarter of the whole visit spent on a page that carries
// robots: { index: false } and can therefore never appear in a result.
// Meanwhile the site's own problem is the opposite one: barely thirty of
// its ~390 pages are indexed at all.
//
// The links were everywhere. The header carries one to /search?q=Էսպորտ on
// every page of the site; the home page's trending bar carries one per
// topic; an article's tag chips fall back to /search for any tag that is
// not a category or a competition. Multiplied by every page a crawler
// reads, that is a lot of invitations into a dead end.
//
// The obvious fix - Disallow: /search in robots.txt - is a trap: a page a
// crawler may not fetch is a page whose noindex it can never read, and
// Google will then sometimes index the bare URL anyway. nofollow says the
// same thing from the other side, on the link rather than the target, and
// leaves the noindex visible.
//
// Only query views are hinted. Plain /search is one URL, already noindex,
// and is linked as a normal destination for readers.
export function noFollowSearch(href: string): "nofollow" | undefined {
  return href.startsWith("/search?") ? "nofollow" : undefined;
}
