import type { Metadata } from "next";
import { NewsCard } from "../../components/news-card";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { getArmenianArticles, toPreview } from "../../lib/articles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Հայկական սպորտ — Հայաստանի ֆուտբոլ | AIFootball.am",
  description: "Հայաստանի ազգային հավաքականների, հայկական ակումբների և տեղական առաջնությունների նորություններ։",
  alternates: { canonical: "https://aifootball.am/armenia" },
};

export default async function ArmeniaPage() {
  const stored = await getArmenianArticles(20);
  const articles = stored.map(toPreview);
  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Ազգային օրակարգ</span><h1 className="page-title">Հայկական սպորտ</h1><p className="page-intro">Ազգային հավաքականներ, հայկական ակումբներ, մեր մարզիկների միջազգային ելույթներն ու տեղական առաջնությունները՝ մեկ բաժնում։</p>
    <div className="page-toolbar"><button className="active" type="button">Բոլորը</button><button type="button">Հավաքականներ</button><button type="button">Ակումբներ</button><button type="button">Անհատական մարզաձևեր</button></div>
    {articles.length ? <section className="category-grid">{articles.slice(0, 9).map((article) => <NewsCard article={article} key={article.slug} />)}</section> : <p className="empty-search">Հայկական սպորտից դեռ նյութեր չկան։ Շուտով կլինեն։</p>}
  </div><SiteFooter /></main>;
}
