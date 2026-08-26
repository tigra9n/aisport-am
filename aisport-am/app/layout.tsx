import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aisport.am"),
  title: "AISport — սպորտային լուրեր հայերեն",
  description: "Հայկական և համաշխարհային սպորտի թարմ լուրերը՝ արագ և հայերեն։",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    siteName: "AISport",
    title: "AISport — սպորտային լուրեր հայերեն",
    description: "Հայկական և համաշխարհային սպորտի թարմ լուրերը՝ արագ և հայերեն։",
    locale: "hy_AM",
    // Homepage/site-wide default - article pages override this with their
    // own real image via generateMetadata. Found missing during a QA
    // sweep: sharing the bare homepage URL had no preview image at all.
    images: [{ url: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=85", width: 1600, height: 900, alt: "AISport.am" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AISport — սպորտային լուրեր հայերեն",
    description: "Հայկական և համաշխարհային սպորտի թարմ լուրերը՝ արագ և հայերեն։",
    images: ["https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=85"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hy" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
