/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsCard } from "../../../components/news-card";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { categories, demoArticles } from "../../../lib/content";
import { getArticlesByCategory } from "../../../lib/articles";
import { resolveArticleImage } from "../../../lib/article-image";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) return {};
  const url = `https://aisport.am/category/${slug}`;
  const description = `${category.name}-ի հայկական և միջազգային ամենաթարմ նորությունները, արդյունքները, վերլուծություններն ու պատմությունները։`;
  return {
    title: `${category.name} — Նորություններ | AISport.am`,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: "AISport", title: `${category.name} — Նորություններ`, description, url, locale: "hy_AM" },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();

  const stored = await getArticlesByCategory(category.name, 20);
  const realArticles = stored.map((a) => ({
    slug: a.slug,
    category: a.category,
    title: a.title,
    excerpt: a.excerpt,
    author: "AISport խմբագրություն",
    time: new Date(a.publishedAt + "Z").toLocaleString("hy-AM", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit", hour12: false }),
    readTime: "3 րոպե",
    image: a.imageUrl || resolveArticleImage(a.category, a.slug),
    local: a.category.includes("Հայաստան"),
    featured: false,
  }));
  // Fall back to demo content only when there's not yet enough real
  // coverage for this category, so the page never shows fake content
  // instead of real published articles when they exist.
  const matched = demoArticles.filter((article) => article.category === category.name);
  const articles = realArticles.length >= 3 ? realArticles : [...realArticles, ...matched, ...demoArticles.filter((article) => !matched.includes(article))].slice(0, 7);
  const lead = articles[0];

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Մարզաձև</span><h1 className="page-title">{category.name}</h1><p className="page-intro">{category.name}-ի հայկական և միջազգային ամենաթարմ նորությունները, արդյունքները, վերլուծություններն ու պատմությունները։</p>
    <div className="page-toolbar">{categories.map((item) => <Link className={item.slug === slug ? "active" : ""} href={`/category/${item.slug}`} key={item.slug}>{item.name}</Link>)}</div>
    <section className="category-hero">
      <article className="main-lead"><Link className="lead-image" href={`/news/${lead.slug}`}><img src={lead.image} alt="" referrerPolicy="no-referrer" /></Link><div className="lead-overlay"><span className="breaking-label">{category.name}</span><h1><Link href={`/news/${lead.slug}`}>{lead.title}</Link></h1><p>{lead.excerpt}</p></div></article>
      <div className="category-list">{articles.slice(1, 4).map((article) => <NewsCard article={article} compact key={article.slug} />)}</div>
    </section>
    <div className="modern-section-head"><div><span>Վերջին հրապարակումները</span><h2>{category.name}․ բոլոր լուրերը</h2></div></div>
    <section className="category-grid">{articles.slice(1).map((article) => <NewsCard article={article} key={article.slug} />)}</section>
  </div><SiteFooter /></main>;
}
