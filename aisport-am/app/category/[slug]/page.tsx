/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsCard } from "../../../components/news-card";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { categories, demoArticles } from "../../../lib/content";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  const matched = demoArticles.filter((article) => article.category === category.name);
  const articles = matched.length >= 3 ? matched : [...matched, ...demoArticles.filter((article) => !matched.includes(article))].slice(0, 7);
  const lead = articles[0];

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Մարզաձև</span><h1 className="page-title">{category.name}</h1><p className="page-intro">{category.name}-ի հայկական և միջազգային ամենաթարմ նորությունները, արդյունքները, վերլուծություններն ու պատմությունները։</p>
    <div className="page-toolbar">{categories.map((item) => <Link className={item.slug === slug ? "active" : ""} href={`/category/${item.slug}`} key={item.slug}>{item.name}</Link>)}</div>
    <section className="category-hero">
      <article className="main-lead"><Link className="lead-image" href={`/news/${lead.slug}`}><img src={lead.image} alt="" /></Link><div className="lead-overlay"><span className="breaking-label">{category.name}</span><h1><Link href={`/news/${lead.slug}`}>{lead.title}</Link></h1><p>{lead.excerpt}</p></div></article>
      <div className="category-list">{articles.slice(1, 4).map((article) => <NewsCard article={article} compact key={article.slug} />)}</div>
    </section>
    <div className="modern-section-head"><div><span>Վերջին հրապարակումները</span><h2>{category.name}․ բոլոր լուրերը</h2></div></div>
    <section className="category-grid">{articles.slice(1).map((article) => <NewsCard article={article} key={article.slug} />)}</section>
  </div><SiteFooter /></main>;
}
