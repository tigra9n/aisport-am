import { NewsCard } from "../../components/news-card";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { demoArticles } from "../../lib/content";

export default function ArmeniaPage() {
  const local = demoArticles.filter((article) => article.local);
  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Ազգային օրակարգ</span><h1 className="page-title">Հայկական սպորտ</h1><p className="page-intro">Ազգային հավաքականներ, հայկական ակումբներ, մեր մարզիկների միջազգային ելույթներն ու տեղական առաջնությունները՝ մեկ բաժնում։</p>
    <div className="page-toolbar"><button className="active" type="button">Բոլորը</button><button type="button">Հավաքականներ</button><button type="button">Ակումբներ</button><button type="button">Անհատական մարզաձևեր</button></div>
    <section className="category-grid">{[...local, ...demoArticles].slice(0, 9).map((article) => <NewsCard article={{...article,local:true}} key={`${article.slug}-armenia`} />)}</section>
  </div><SiteFooter /></main>;
}
