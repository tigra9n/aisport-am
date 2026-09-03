import { RevealGrid } from "../../components/reveal-grid";
import type { Metadata } from "next";
import { NewsCard } from "../../components/news-card";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { categories } from "../../lib/content";
import { searchArticles, toPreview } from "../../lib/articles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Որոնում | AIFootball.am",
  description: "Փնտրիր թիմ, մարզիկ կամ մրցաշար AIFootball.am-ի հրապարակած նյութերում։",
  // A search result page is not a page of the site; it is a view of it.
  // Indexing one URL per query fills the index with near-identical pages
  // and, worse, competes with the articles themselves. follow is kept so
  // the crawler still uses these pages as a route to the articles.
  robots: { index: false, follow: true },
  alternates: { canonical: "https://aifootball.am/search" },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q = "", category = "" } = await searchParams;
  const stored = await searchArticles(q, category, 30);
  const results = stored.map(toPreview);
  return <main><SiteHeader /><div className="site-shell inner-page"><span className="page-kicker">Արագ գտնել</span><h1 className="page-title">Որոնում</h1>
    <form className="search-form-large"><input name="q" defaultValue={q} placeholder="Թիմ, մարզիկ, մրցաշար…" /><button type="submit">Որոնել</button></form>
    <div className="page-toolbar"><a className={!category ? "active" : ""} href={`/search?q=${encodeURIComponent(q)}`}>Բոլորը</a>{categories.slice(0,5).map((item) => <a className={category === item.name ? "active" : ""} href={`/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(item.name)}`} key={item.slug}>{item.name}</a>)}</div>
    <section className="search-results">{results.length ? <RevealGrid className="category-grid" total={results.length}>{results.map((article) => <NewsCard article={article} key={article.slug} />)}</RevealGrid> : <div className="empty-search">Այս որոնմամբ նյութ չի գտնվել։ Փորձեք թիմի, մարզիկի կամ մրցաշարի այլ անվանում։</div>}</section>
  </div><SiteFooter /></main>;
}
