import { NextRequest, NextResponse } from "next/server";

// Once aifootball.am is live, this makes aisport.am permanently redirect
// page requests to the same URL on aifootball.am - the old domain keeps
// working for existing links/bookmarks/search results, it just forwards
// visitors (and search engine crawlers, via the 301 status) to the new
// canonical domain instead of serving duplicate content on two hostnames.
//
// 301 rather than 308 because this is a site move, and Google's Change of
// Address tool in Search Console documents 301 as the redirect a move must
// use. The two are both permanent redirects and a browser treats them
// identically for the GET page requests this matcher covers - 308 only
// adds a guarantee that the request method survives the redirect, which
// matters for POST and is irrelevant here, since /api is excluded below
// precisely so that non-GET and machine callers never see a redirect at
// all. So 301 costs nothing and is the status the tooling expects.
//
// BUG FOUND AND FIXED: /api/* was originally included in this redirect
// too. cron-job.org (external service, triggers /api/cron/dispatch every
// 5 minutes) hits aisport.am directly and doesn't follow the 308 - this
// silently stopped the entire automated content pipeline for 3+ hours
// after the migration deployed, since the redirect response was never
// actually executing the dispatch logic. API endpoints must keep working
// identically on both domains regardless of what any external caller
// (cron services, webhooks, etc.) does with a redirect, since we can't
// control or verify third-party redirect-following behavior.
const OLD_HOSTS = new Set(["aisport.am", "www.aisport.am"]);
const NEW_HOST = "aifootball.am";

// The site's first seven articles, all published on 24 August before
// transliteration existed, were stored with Armenian-script slugs, so their
// URLs read as percent-encoded gibberish. Their slugs have been rewritten to
// the Latin form the current code would produce, and these redirects keep the
// original URLs working: they are indexed, and letting them 404 days after
// registering a site move would throw away exactly what that move preserves.
//
// The list is closed. slugify() strips everything outside [a-z0-9-], so no
// further Armenian slug can be created, and every one of the 291 articles
// published since is already Latin.
const RENAMED_NEWS_SLUGS: Record<string, string> = {
  "արակս-արարատ-ը-ընդունում-է-կիլիկիային-գավաթային-af-1588810-preview":
    "araks-ararat-y-yndunum-e-kilikiayin-gavatayin-af-1588810-preview",
  "ֆուլհեմ-չելսի-պրեմիեր-լիգայի-կարևոր-հանդիպում-af-1557376-preview":
    "fulhem-chelsi-premier-ligayi-karevor-handipum-af-1557376-preview",
  "օսասունա---լևանտե-լա-լիգայի-հանդիպում-af-1570350-preview":
    "osasuna---levante-la-ligayi-handipum-af-1570350-preview",
  "մալագան-ընդունում-է-դեպորտիվոյին-լա-լիգայի-af-1570349-preview":
    "malagan-yndunum-e-deportivoyin-la-ligayi-af-1570349-preview",
  "բոլոնիան-հյուրընկալում-է-լացիոյին-սերիա-ա-ում-af-1550089-preview":
    "bolonian-hyurynkalum-e-latsioyin-seria-a-um-af-1550089-preview",
  "ռոման-հյուրընկալում-է-ֆիորենտինային-af-1550087-preview":
    "roman-hyurynkalum-e-fiorentinayin-af-1550087-preview",
  "անգլիայի-հավաքականի-գիշերային-արկածները-նոր-գլխացավանք-66997343":
    "angliayi-havaqakani-gisherayin-arkatsnery-nor-glkhatsavanq-66997343",
};

// Article URLs arrive percent-encoded, so decode before matching. A malformed
// escape sequence would throw, in which case the raw form is still worth a
// lookup rather than failing the whole request.
function renamedNewsPath(pathname: string): string | null {
  const prefix = "/news/";
  if (!pathname.startsWith(prefix)) return null;
  const raw = pathname.slice(prefix.length);
  let slug = raw;
  try { slug = decodeURIComponent(raw); } catch { /* fall back to the raw form */ }
  const renamed = RENAMED_NEWS_SLUGS[slug] ?? RENAMED_NEWS_SLUGS[raw];
  return renamed ? prefix + renamed : null;
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase().split(":")[0] ?? "";
  const url = new URL(request.url);
  const onOldHost = OLD_HOSTS.has(host);
  const renamedPath = renamedNewsPath(url.pathname);
  if (!onOldHost && !renamedPath) return NextResponse.next();

  // Applied together so an old URL for a renamed article reaches its final
  // destination in one hop, rather than being bounced host-first and then
  // slug-second - a chain Google follows but counts against the move.
  if (renamedPath) url.pathname = renamedPath;
  if (onOldHost) {
    url.hostname = NEW_HOST;
    url.port = "";
    url.protocol = "https:";
  }
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
