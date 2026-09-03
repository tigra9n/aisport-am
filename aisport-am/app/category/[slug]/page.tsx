/* eslint-disable @next/next/no-img-element */
import { RevealGrid } from "../../../components/reveal-grid";
import { imageSrcSet, shareImage, sizedImage } from "../../../lib/image-proxy";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsCard } from "../../../components/news-card";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { categories } from "../../../lib/content";
import { getArticlesByCategory, toPreview } from "../../../lib/articles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) return {};
  const url = `https://aifootball.am/category/${slug}`;
  const description = `${category.name}-ի հայկական և միջազգային ամենաթարմ նորությունները, արդյունքները, վերլուծություններն ու պատմությունները։`;
  const lead = (await getArticlesByCategory(category.name, 1)).map(toPreview)[0] ?? null;
  return {
    title: `${category.name} — Նորություններ | AIFootball.am`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website", siteName: "AIFootball", title: `${category.name} — Նորություններ`, description, url, locale: "hy_AM",
      images: [{ url: shareImage(lead?.image), width: 1200, height: 630, alt: category.name }],
    },
    twitter: { card: "summary_large_image", title: `${category.name} — Նորություններ`, description, images: [shareImage(lead?.image)] },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();

  const stored = await getArticlesByCategory(category.name, 20);
  const articles = stored.map(toPreview);
  const lead = articles[0];

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Մարզաձև</span><h1 className="page-title">{category.name}</h1><p className="page-intro">{category.name}-ի հայկական և միջազգային ամենաթարմ նորությունները, արդյունքները, վերլուծություններն ու պատմությունները։</p>
    <div className="page-toolbar">{categories.map((item) => <Link className={item.slug === slug ? "active" : ""} href={`/category/${item.slug}`} key={item.slug}>{item.name}</Link>)}</div>
    {lead ? <>
      <section className="category-hero">
        <article className="main-lead"><Link className="lead-image" href={`/news/${lead.slug}`}><img src={sizedImage(lead.image, 700)} srcSet={imageSrcSet(lead.image, [360, 760, 1400])} sizes="(max-width:700px) calc(100vw - 24px), 700px" alt={lead.title} referrerPolicy="no-referrer" decoding="async" fetchPriority="high" /></Link><div className="lead-overlay"><span className="breaking-label">{category.name}</span><h2><Link href={`/news/${lead.slug}`}>{lead.title}</Link></h2><p>{lead.excerpt}</p></div></article>
        <div className="category-list">{articles.slice(1, 4).map((article) => <NewsCard article={article} compact key={article.slug} />)}</div>
      </section>
      <div className="modern-section-head"><div><span>Վերջին հրապարակումները</span><h2>{category.name}․ բոլոր լուրերը</h2></div></div>
      <RevealGrid className="category-grid" total={Math.max(articles.length - 4, 0)}>{articles.slice(4).map((article) => <NewsCard article={article} key={article.slug} />)}</RevealGrid>
    </> : <p className="empty-search">Այս մարզաձևից դեռ նյութեր չկան։ Շուտով կլինեն։</p>}
  </div><SiteFooter /></main>;
}
