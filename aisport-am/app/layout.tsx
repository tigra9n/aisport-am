import { shareImage } from "../lib/image-proxy";
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aifootball.am"),
  title: "AIFootball — սպորտային լուրեր հայերեն",
  description: "Միջազգային ֆուտբոլի և հայկական սպորտի թարմ լուրերը՝ արագ և հայերեն։",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "AIFootball",
    title: "AIFootball — սպորտային լուրեր հայերեն",
    description: "Միջազգային ֆուտբոլի և հայկական սպորտի թարմ լուրերը՝ արագ և հայերեն։",
    locale: "hy_AM",
    // Homepage/site-wide default - article pages override this with their
    // own real image via generateMetadata. Found missing during a QA
    // sweep: sharing the bare homepage URL had no preview image at all.
    images: [{ url: shareImage(null), width: 1200, height: 630, alt: "AIFootball.am" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIFootball — սպորտային լուրեր հայերեն",
    description: "Միջազգային ֆուտբոլի և հայկական սպորտի թարմ լուրերը՝ արագ և հայերեն։",
    images: [shareImage(null)],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hy" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Hosts the browser cannot discover until it is parsing, by which
            time the handshake is on the critical path.

            wsrv.nl matters most and was missing: every photograph on the
            site is served through it, including the one that is the largest
            element on an article page, so its DNS lookup and TLS handshake
            were being paid for at the exact moment that measurement is
            taken. */}
        <link rel="preconnect" href="https://wsrv.nl" crossOrigin="" />
        <link rel="preconnect" href="https://media.api-sports.io" crossOrigin="" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
      </head>
      <body>
        {children}
        {/* Google Analytics 4 - property created 2026-08-27 for real
            traffic/source tracking (Search Console alone doesn't show
            session-level behavior). lazyOnload rather than afterInteractive:
            gtag.js is 170 KB, the single largest script the site loads, and
            none of the page depends on it, so it waits until everything else
            has finished. GA4 still records the pageview.

            gtag.js is injected by hand instead of by <Script src> so that it
            can be withheld from automated browsers. On 2026-09-04 the report
            for a single day showed 198 "users", of whom 9 were in Armenia;
            the top cities were Flint Hill, Moses Lake, Boardman, Des Moines
            and Dublin - Amazon, Azure and Google datacentre regions, not
            people. Part of that is crawlers, and part is this repository's
            own doing: audit.mjs, a11y.mjs, vitals.mjs and page-weight.mjs
            drive a real Chromium against the live site from GitHub Actions
            runners, which sit in exactly those regions, and a real Chromium
            runs gtag.js and is counted. Every one of those tools sets
            navigator.webdriver, so the flag separates them from readers.
            Bots that never execute JavaScript were never in these numbers
            to begin with. */}
        <Script id="ga4-init" strategy="lazyOnload">
          {`if (!navigator.webdriver && !/HeadlessChrome/.test(navigator.userAgent)) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ window.dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', 'G-LETFRQPT04');
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-LETFRQPT04';
  document.head.appendChild(s);
}`}
        </Script>
      </body>
    </html>
  );
}
