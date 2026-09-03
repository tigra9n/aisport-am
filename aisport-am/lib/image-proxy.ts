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

// Our own URLs are already the right size, and sending the proxy its own
// output back would be a loop. Everything else is fair game: even a team
// badge is worth it - api-sports serves them as 88 KB PNGs for a 24px slot,
// and the proxy returns 9 KB of WebP.
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

/**
 * A `srcset` for the same image at several real widths.
 *
 * `sizedImage` has to guess: it asks for twice the widest slot the image
 * ever occupies, which is right for a 2x desktop and roughly twice too much
 * for a phone. A 360px screen was downloading the 1400px copy of a lead
 * photograph to paint it 360px wide.
 *
 * With a `srcset` the browser decides instead, and it knows both the real
 * slot width (from `sizes`) and its own pixel density - so the widths here
 * are real pixels, NOT doubled. Pair it with `sizes`; without one the
 * browser assumes the image fills the viewport and picks too large a copy.
 */
export function imageSrcSet(src: string | null | undefined, widths: number[]): string | undefined {
  if (!src || !PROXY_IMAGES || !isProxyable(src)) return undefined;
  return widths
    .map((width) => {
      // No `default` here, unlike sizedImage. It repeats the whole source
      // address a second time in every entry, and a page of forty cards
      // pays for that twice over - once in the attribute, once in Next's
      // serialised payload. The first measurement showed the HTML growing
      // by more than the images shrank. The `src` alongside keeps the
      // failsafe for anything that cannot read a srcset.
      const params = new URLSearchParams({
        url: src,
        w: String(width),
        q: "68",
        output: "webp",
        we: "",
      });
      return `${PROXY}?${params.toString()} ${width}w`;
    })
    .join(", ");
}

/**
 * Ask the proxy for a freshly published article's photograph, so the first
 * reader does not have to wait for it to be fetched and re-encoded.
 *
 * The home page's largest element is the newest article's picture, and that
 * picture changes every twenty minutes. Measured at 360px with the CPU
 * throttled 4x, the home LCP swung between 1.43s and 3.91s across runs while
 * an older article's page held steady near 1.7s - the difference being
 * whether the proxy had seen that image before. Whoever arrives first after
 * a publication pays for the miss.
 *
 * Called from the cron after a successful save. Failures are ignored: this
 * is a favour to the next visitor, never a condition of publishing.
 */
export async function warmImageCache(src: string | null | undefined): Promise<void> {
  if (!src || !PROXY_IMAGES || !isProxyable(src)) return;

  // The widths the hero, the cards and the article page actually request.
  const urls = [sizedImage(src, 700), sizedImage(src, 900), ...(imageSrcSet(src, [360, 760, 1400])?.split(", ").map((entry) => entry.split(" ")[0]) ?? [])];

  await Promise.all(
    [...new Set(urls)].map(async (url) => {
      try {
        await fetch(url, { method: "GET", cf: { cacheEverything: true } } as RequestInit);
      } catch {
        // The proxy being slow or unreachable is exactly the case this is
        // trying to soften; it must not become a reason not to publish.
      }
    }),
  );
}

// The picture Telegram, Facebook and WhatsApp show when a link is posted.
//
// It has a harder job than an image on a page. A social crawler fetches it
// with no referrer and no cookies, and several of the sources the site uses
// refuse exactly that - the Getty photograph on an opinion piece answers
// 400 to a bare request, which means Tigran's own articles, the best thing
// on the site, would post with no picture at all.
//
// Routing it through the proxy fixes that in two ways: the fetch is made by
// the proxy rather than by Facebook, and if the source refuses even that,
// `default` hands back a picture that is always available instead of an
// error. A card with a stock photograph is worth much more than a card with
// a grey box.
//
// JPEG rather than WebP: the page can serve WebP because browsers all read
// it, but link previews are rendered by a long tail of clients and JPEG is
// the format none of them get wrong.
const SHARE_FALLBACK = "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=85";

export function shareImage(src: string | null | undefined): string {
  const source = src && src.startsWith("http") ? src : SHARE_FALLBACK;
  if (!PROXY_IMAGES) return source;
  const params = new URLSearchParams({
    url: source,
    w: "1200",
    h: "630",
    fit: "cover",
    // 80 gave a 405 KB card for a detailed Getty photograph - four times
    // what the same card weighs for an ordinary press image, downloaded
    // every time the link is unfurled in a chat. At this size the card is
    // seen at about 500px wide in a feed; 74 is indistinguishable there and
    // costs a third less.
    q: "74",
    output: "jpg",
    default: SHARE_FALLBACK,
  });
  return `${PROXY}?${params.toString()}`;
}
