import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { categories } from "../lib/content";

// There was no not-found page at all, so a wrong address answered with the
// framework's bare "Not Found" - nine characters of English on a site that
// is otherwise entirely Armenian, with no header, no footer and no way
// onward. A reader who mistypes an address, or follows an old link from
// somewhere, met a blank page and left.
export const metadata: Metadata = {
  title: "Էջը չի գտնվել | AIFootball.am",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return <main><SiteHeader /><div className="site-shell inner-page not-found-page">
    <span className="page-kicker">404</span>
    <h1 className="page-title">Այս էջը չկա</h1>
    <p className="page-intro">
      Հասցեն սխալ է, կամ նյութը տեղափոխվել է։ Ահա որտեղից կարող ես շարունակել․
    </p>
    <div className="page-toolbar">
      <Link href="/">Գլխավոր</Link>
      <Link href="/live">Ուղիղ արդյունքներ</Link>
      <Link href="/standings">Աղյուսակներ</Link>
      <Link href="/topscorers">Ռմբարկուներ</Link>
      <Link href="/opinions">Հեղինակային</Link>
    </div>
    <h2 className="not-found-heading">Ըստ մարզաձևի</h2>
    <div className="page-toolbar">
      {categories.map((category) => (
        <Link href={`/category/${category.slug}`} key={category.slug}>{category.name}</Link>
      ))}
    </div>
  </div><SiteFooter /></main>;
}
