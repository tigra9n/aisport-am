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
    images: [{ url: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=85", width: 1600, height: 900, alt: "AIFootball.am" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AIFootball — սպորտային լուրեր հայերեն",
    description: "Միջազգային ֆուտբոլի և հայկական սպորտի թարմ լուրերը՝ արագ և հայերեն։",
    images: ["https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=85"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hy" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* The team badges and the analytics script come from two hosts the
            browser cannot discover until it is parsing, by which time the
            handshake is on the critical path. */}
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
            has finished. GA4 still records the pageview. */}
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-LETFRQPT04" strategy="lazyOnload" />
        <Script id="ga4-init" strategy="lazyOnload">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-LETFRQPT04');`}
        </Script>
      </body>
    </html>
  );
}
