/* eslint-disable @next/next/no-img-element */
import { RevealGrid } from "../../../components/reveal-grid";
import { imageSrcSet, shareImage, sizedImage } from "../../../lib/image-proxy";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsCard } from "../../../components/news-card";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { LEAGUE_TAGS } from "../../../lib/league-tags";
import { getArticlesByLeague, toPreview } from "../../../lib/articles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const league = LEAGUE_TAGS.find((item) => item.code === code.toUpperCase());
  if (!league) return {};
  const url = `https://aifootball.am/league/${code}`;
  const description = `${league.label}-ի ամենաթարմ նորությունները, տրանսֆերները և վերլուծությունները։`;
  const lead = (await getArticlesByLeague(league.code, 1)).map(toPreview)[0] ?? null;
  return {
    title: `${league.label} — Նորություններ | AIFootball.am`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website", siteName: "AIFootball", title: `${league.label} — Նորություններ`, description, url, locale: "hy_AM",
      // A league link posted to Telegram had no picture at all. The page's
      // own lead article is the honest one to show.
      images: [{ url: shareImage(lead?.image), width: 1200, height: 630, alt: league.label }],
    },
    twitter: { card: "summary_large_image", title: `${league.label} — Նորություններ`, description, images: [shareImage(lead?.image)] },
  };
}

export default async function LeaguePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const league = LEAGUE_TAGS.find((item) => item.code === code.toUpperCase());
  if (!league) notFound();

  const stored = await getArticlesByLeague(league.code, 30);
  const articles = stored.map(toPreview);
  const lead = articles[0];

  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Մրցաշար</span><h1 className="page-title">{league.label}</h1><p className="page-intro">{league.label}-ի ամենաթարմ նորությունները, տրանսֆերները և վերլուծությունները։</p>
    <div className="page-toolbar">{LEAGUE_TAGS.map((item) => <Link className={item.code === league.code ? "active" : ""} href={`/league/${item.code}`} key={item.code}>{item.label}</Link>)}</div>
    {lead ? <>
      <section className="category-hero">
        <article className="main-lead"><Link className="lead-image" href={`/news/${lead.slug}`}><img src={sizedImage(lead.image, 700)} srcSet={imageSrcSet(lead.image, [360, 760, 1400])} sizes="(max-width:700px) calc(100vw - 24px), 700px" alt={lead.title} referrerPolicy="no-referrer" decoding="async" fetchPriority="high" /></Link><div className="lead-overlay"><span className="breaking-label">{league.label}</span><h2><Link href={`/news/${lead.slug}`}>{lead.title}</Link></h2><p>{lead.excerpt}</p></div></article>
        <div className="category-list">{articles.slice(1, 4).map((article) => <NewsCard article={article} compact key={article.slug} />)}</div>
      </section>
      <div className="modern-section-head"><div><span>Վերջին հրապարակումները</span><h2>{league.label}․ բոլոր լուրերը</h2></div></div>
      <RevealGrid className="category-grid" total={Math.max(articles.length - 4, 0)}>{articles.slice(4).map((article) => <NewsCard article={article} key={article.slug} />)}</RevealGrid>
    </> : <p className="empty-search">Այս մրցաշարից դեռ նյութեր չկան։ Շուտով կլինեն։</p>}
  </div><SiteFooter /></main>;
}
