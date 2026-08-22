import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AISport — սպորտային լուրեր հայերեն",
  description: "Հայկական և համաշխարհային սպորտի թարմ լուրերը՝ արագ և հայերեն։",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hy" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
