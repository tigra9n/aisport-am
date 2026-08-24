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
  },
  twitter: {
    card: "summary_large_image",
    title: "AISport — սպորտային լուրեր հայերեն",
    description: "Հայկական և համաշխարհային սպորտի թարմ լուրերը՝ արագ և հայերեն։",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hy" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
