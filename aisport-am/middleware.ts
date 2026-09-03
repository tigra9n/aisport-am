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

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase().split(":")[0] ?? "";
  if (OLD_HOSTS.has(host)) {
    const url = new URL(request.url);
    url.hostname = NEW_HOST;
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
