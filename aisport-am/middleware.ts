import { NextRequest, NextResponse } from "next/server";

// Once aifootball.am is live, this makes aisport.am permanently redirect
// every request (any path, preserving query string) to the same URL on
// aifootball.am - the old domain keeps working for existing links/
// bookmarks/search results, it just forwards visitors (and search engine
// crawlers, via the 308 status) to the new canonical domain instead of
// serving duplicate content on two hostnames.
const OLD_HOSTS = new Set(["aisport.am", "www.aisport.am"]);
const NEW_HOST = "aifootball.am";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase().split(":")[0] ?? "";
  if (OLD_HOSTS.has(host)) {
    const url = new URL(request.url);
    url.hostname = NEW_HOST;
    url.port = "";
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
