import type { Metadata } from "next";

/**
 * What a page says about itself when the thing it is about does not exist.
 *
 * MEASURED on 7 September, from a runner opening the live site:
 * /news/does-not-exist-xyz answered 404 with the title
 * "AIFootball — սպորտային լուրեր հայերեն" - the site-wide default from
 * app/layout.tsx. Twelve generateMetadata functions returned an empty
 * object for a missing article, club, player, coach, match, category,
 * league or opinion, and an empty object inherits the layout, so every
 * address Google ever guessed wrong presented itself as a copy of the
 * home page. app/not-found.tsx has carried a proper Armenian title since
 * it was written, but Next does not apply it to a route that has its own
 * generateMetadata.
 *
 * Search Console mailed the same morning about pages it would not index,
 * and its first two reasons were "duplicate, canonical not chosen by the
 * user" and "not found (404)". A wrong address is not a duplicate of the
 * home page; it just said it was.
 */
export const missingPageMetadata: Metadata = {
  title: "Էջը չի գտնվել | AIFootball.am",
  description: "Այս հասցեով էջ չկա։",
  robots: { index: false, follow: true },
};
