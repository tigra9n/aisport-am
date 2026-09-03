// Article images come straight from the sources' own servers, at whatever
// size those servers publish: the home page was downloading 1200px files to
// display them 82px wide, and one Getty photograph alone weighed 436 KB -
// more than any script on the site. Cloudflare will not resize them for us
// (image transformations are not enabled on this zone, and R2 is not enabled
// on the account), so the images are fetched through wsrv.nl, a free image
// cache that resizes and re-encodes on the way through. No account, no key,
// no payment.
//
// If it ever becomes a problem, PROXY_IMAGES = false restores the previous
// behaviour everywhere in one edit - every call site goes through here.
const PROXY_IMAGES = true;
const PROXY = "https://wsrv.nl/";

// Hosts whose images we serve unchanged: our own, and the API's team badges,
// which are already small and are requested by dozens of pages at once.
function isProxyable(src: string): boolean {
  if (!src.startsWith("http://") && !src.startsWith("https://")) return false;
  try {
    const host = new URL(src).hostname;
    if (host.endsWith("aifootball.am") || host.endsWith("aisport.am")) return false;
    if (host === "wsrv.nl") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * A resized, re-encoded copy of a remote image.
 *
 * `width` is the widest the image is ever displayed, in CSS pixels; the
 * proxy is asked for twice that so it stays sharp on a phone screen. `we`
 * means never enlarge - a source smaller than the request is passed through
 * at its own size rather than blown up. `default` hands back the original
 * image if the proxy cannot fetch or process it, so a source that blocks the
 * proxy degrades to what the site does today instead of to a broken image.
 */
export function sizedImage(src: string | null | undefined, width: number): string {
  if (!src) return "";
  if (!PROXY_IMAGES || !isProxyable(src)) return src;
  const params = new URLSearchParams({
    url: src,
    w: String(width * 2),
    q: "72",
    output: "webp",
    we: "",
    default: src,
  });
  return `${PROXY}?${params.toString()}`;
}
